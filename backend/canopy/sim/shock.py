"""Shock injectors — the demo's money shot.

kill_top_agent: force-bankrupt the market's best agent. The next jobs in
its niche clear HIGHER (its sharp pricing + rep discount are gone), then
the market heals on its own: survivors win, build reputation, and walk
the price back down. Nobody re-plans anything — the mechanism does it.

demand_spike: burst-post jobs in one category to make the re-pricing
visible immediately after the kill.
"""
import weave

from canopy.jobs.schema import Job
from canopy.market import events, matching, registry
from canopy.market.reputation import LEADERBOARD_KEY
from canopy.redis_client import get_redis


@weave.op
async def kill_top_agent() -> str | None:
    """Deactivate the highest-reputation active agent. Returns its id."""
    r = get_redis()
    ranked = await r.zrange(LEADERBOARD_KEY, 0, -1, desc=True)
    active = set(await registry.active_agent_ids())
    target = next((a for a in ranked if a in active), None)
    if target is None:
        return None
    pipe = r.pipeline()
    pipe.hset(f"agent:{target}", "status", "bankrupt")
    pipe.srem(registry.AGENTS_SET, target)
    await pipe.execute()
    await matching.remove_agent_skills(target)
    await events.emit("shock", {"kind": "kill_top_agent", "agent_id": target})
    await events.emit("bankruptcy", {"agent_id": target, "balance": None, "cause": "shock"})
    return target


async def spike_jobs(category: str | None, n: int, client_id: str = "human") -> list[Job]:
    """Build a burst of jobs (optionally one category) for a demand spike.
    The caller runs them through the market."""
    from canopy.jobs.seed import QUESTION_BANK  # late import avoids cycles

    bank = [
        q for q in QUESTION_BANK if (category is None or q[2] == category) and q[3] == 2
    ] or [q for q in QUESTION_BANK if q[3] == 2]
    r = get_redis()
    jobs = []
    for i in range(n):
        seq = await r.incr("market:job_counter")
        question, truth, cat, hops = bank[i % len(bank)]
        jobs.append(
            Job(
                id=f"job-s{seq:03d}",
                spec=question,
                category=cat,
                hops=hops,
                client_id=client_id,
                ground_truth=truth,
            )
        )
    await events.emit("shock", {"kind": "demand_spike", "category": category, "jobs": n})
    return jobs
