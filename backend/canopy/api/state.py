"""Market state snapshot — everything the trading floor renders.

The frontend is a pure projection: this snapshot (and JSON-Patch deltas
against it) is the ONLY thing the UI knows. All of it reads straight off
the Redis primitives — agent hashes, the jobs:open ZSET, the events
Stream, prices ZSETs, the leaderboard ZSET.
"""
import json

from canopy.config import settings
from canopy.market.events import EVENTS_STREAM
from canopy.market.ledger import LEDGER_STREAM
from canopy.redis_client import get_redis

EVENTS_TAIL = 60  # how many recent events the feed shows

REPORT_KEY = "market:report"  # analyst-generated HTML (open-ended gen-UI)
JOB_DETAIL_KEY = "market:job_detail"  # structured UI spec (declarative gen-UI)
PENDING_ACTION_KEY = "market:pending_action"  # HITL approval slot


async def market_snapshot() -> dict:
    r = get_redis()

    # agents: every agent hash except the human client
    agents = []
    async for key in r.scan_iter(match="agent:*", count=200):
        a = await r.hgetall(key)
        if not a or a.get("id") in (None, "human"):
            continue
        agents.append(
            {
                "id": a["id"],
                "name": a.get("name", a["id"]),
                "strategy": a.get("strategy", ""),
                "model_tier": a.get("model_tier", ""),
                "status": a.get("status", "active"),
                "balance": float(a.get("balance", 0)),
                "reputation": float(a.get("reputation", 0.5)),
                "jobs_won": int(a.get("jobs_won", 0)),
                "jobs_failed": int(a.get("jobs_failed", 0)),
                "parent_id": a.get("parent_id", "") or None,
            }
        )
    agents.sort(key=lambda a: -a["reputation"])

    # order book: open jobs (ZSET) + full job docs incl. status for recents
    open_ids = await r.zrange("jobs:open", 0, -1)
    jobs = []
    async for key in r.scan_iter(match="job:job-*", count=500):
        if key.count(":") != 1:  # skip job:{id}:bids / :bid_prices
            continue
        raw = await r.get(key)
        if not raw:
            continue
        j = json.loads(raw)
        bids = await r.zrange(f"job:{j['id']}:bids", 0, -1, withscores=True)
        jobs.append(
            {
                "id": j["id"],
                "spec": j["spec"],
                "category": j["category"],
                "hops": j.get("hops", 2),
                "status": j["status"],
                "client_id": j["client_id"],
                "winner_id": j.get("winner_id"),
                "price": j.get("escrow_amount", 0.0),
                "parent_job_id": j.get("parent_job_id"),
                "open": j["id"] in open_ids,
                "bids": [
                    {"agent_id": aid, "effective_bid": round(eff, 3)} for aid, eff in bids
                ],
            }
        )
    jobs.sort(key=lambda j: j["id"])

    # event feed: tail of the events Stream
    events = []
    for _id, fields in await r.xrevrange(EVENTS_STREAM, count=EVENTS_TAIL):
        evt = json.loads(fields["data"])
        events.append(evt)
    events.reverse()

    # clearing-price history per (category, hops)
    prices: dict[str, list[float]] = {}
    async for key in r.scan_iter(match="prices:*", count=200):
        series = await r.zrange(key, 0, -1)
        prices[key.removeprefix("prices:")] = [
            round(float(m.rsplit(":", 1)[1]), 3) for m in series
        ]

    ledger_len = await r.xlen(LEDGER_STREAM)
    report_html = await r.get(REPORT_KEY)
    job_detail_raw = await r.get(JOB_DETAIL_KEY)
    pending_raw = await r.get(PENDING_ACTION_KEY)

    return {
        "market": "canopy",
        "redis_connected": True,
        "agents": agents,
        "jobs": jobs,
        "events": events,
        "prices": prices,
        "ledger_entries": ledger_len,
        # declarative gen-UI: structured spec the frontend's renderer walks
        "job_detail": json.loads(job_detail_raw) if job_detail_raw else None,
        # open-ended gen-UI: agent-authored HTML for the sandboxed iframe
        "report_html": report_html,
        # HITL: high-impact action awaiting human approval (None = nothing)
        "pending_action": json.loads(pending_raw) if pending_raw else None,
        "reserve_price": settings.reserve_price,
    }
