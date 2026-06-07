"""Anti-collusion guard — detect self-dealing loops in the ledger.

The simplest reputation-farming attack in a subcontracting market: A hires
B, B hires A back, money (and reputation-building "wins") circulate between
a clique without real work leaving it. This scans the escrow_release legs
of the ledger for reciprocal payment loops (A→B and B→A) and, when the
back-and-forth volume crosses a threshold, flags the pair and applies a
reputation penalty through the normal score channel.

Deliberately simple per spec §10: a detector + a recorded penalty, not a
general mechanism-design solution. The point is to acknowledge the
pathology and show the market has a guard.
"""
import weave

from canopy.config import settings
from canopy.market import events
from canopy.market.reputation import update_reputation
from canopy.redis_client import get_redis

FLAGGED_KEY = "market:collusion_flagged"  # set of "a|b" pairs already penalized


@weave.op
async def scan_collusion() -> list[dict]:
    """Find reciprocal payment loops above the volume threshold; penalize new
    ones. Returns the pairs flagged this scan."""
    r = get_redis()
    # pair (sorted) -> {a->b: amount, b->a: amount}
    flows: dict[tuple[str, str], dict[str, float]] = {}
    for _id, f in await r.xrange("ledger", count=5000):
        if f.get("type") != "escrow_release":
            continue
        src, dst = f.get("from"), f.get("to")
        # escrow_release is from "escrow"; the paying CLIENT is the job's
        # client — reconstruct via the job_id's client when it's an agent
        job_id = f.get("job_id", "")
        if not job_id:
            continue
        raw = await r.get(f"job:{job_id}")
        if not raw:
            continue
        import json

        job = json.loads(raw)
        client, worker = job.get("client_id"), job.get("winner_id")
        if not client or not worker or client == "human" or client == worker:
            continue  # only agent→agent subcontract payments can collude
        key = tuple(sorted((client, worker)))
        leg = f"{client}->{worker}"
        flows.setdefault(key, {})
        flows[key][leg] = flows[key].get(leg, 0.0) + float(f.get("amount", 0))

    flagged = []
    for (a, b), legs in flows.items():
        ab = legs.get(f"{a}->{b}", 0.0)
        ba = legs.get(f"{b}->{a}", 0.0)
        # reciprocal loop: both directions paid, each above the threshold
        if ab >= settings.collusion_min_volume and ba >= settings.collusion_min_volume:
            pair = f"{a}|{b}"
            if await r.sismember(FLAGGED_KEY, pair):
                continue  # already penalized this clique
            await r.sadd(FLAGGED_KEY, pair)
            for agent_id in (a, b):
                # recorded penalty through the reputation channel (stays
                # Weave-score-derived: a zero-score observation, not a write)
                await update_reputation(agent_id, 0.0)
            await events.emit(
                "collusion_flagged",
                {"agents": [a, b], "volume": round(ab + ba, 2),
                 "reason": "reciprocal self-dealing loop"},
            )
            flagged.append({"agents": [a, b], "volume": round(ab + ba, 2)})
    return flagged
