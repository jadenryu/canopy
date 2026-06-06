"""The order book — `jobs:open` ZSET (score = posted_ts) + per-job bid book.

Bid book: `job:{id}:bids` ZSET scored by effective_bid (lowest wins) plus
`job:{id}:bid_prices` Hash holding each agent's raw asking price (the
amount actually escrowed/paid if it wins).
"""
import time

from canopy.jobs.schema import Bid, Job
from canopy.market import events
from canopy.redis_client import get_redis

JOBS_OPEN_KEY = "jobs:open"


async def save_job(job: Job) -> None:
    r = get_redis()
    await r.set(f"job:{job.id}", job.model_dump_json())


async def get_job(job_id: str) -> Job | None:
    r = get_redis()
    raw = await r.get(f"job:{job_id}")
    return Job.model_validate_json(raw) if raw else None


async def post_job(job: Job) -> None:
    r = get_redis()
    await save_job(job)
    await r.zadd(JOBS_OPEN_KEY, {job.id: time.time()})
    await events.emit(
        "job_posted",
        {
            "job_id": job.id,
            "spec": job.spec,
            "category": job.category,
            "bounty_cap": job.bounty_cap,
            "client_id": job.client_id,
        },
    )


async def place_bid(bid: Bid) -> None:
    r = get_redis()
    pipe = r.pipeline()
    pipe.zadd(f"job:{bid.job_id}:bids", {bid.agent_id: bid.effective_bid})
    pipe.hset(f"job:{bid.job_id}:bid_prices", bid.agent_id, f"{bid.price:.4f}")
    await pipe.execute()
    await events.emit(
        "bid_placed",
        {
            "job_id": bid.job_id,
            "agent_id": bid.agent_id,
            "price": round(bid.price, 4),
            "effective_bid": round(bid.effective_bid, 4),
        },
    )


async def lowest_bid(job_id: str) -> Bid | None:
    """Winner = lowest effective_bid in the bid-book ZSET."""
    r = get_redis()
    top = await r.zrange(f"job:{job_id}:bids", 0, 0, withscores=True)
    if not top:
        return None
    agent_id, effective = top[0]
    price = float(await r.hget(f"job:{job_id}:bid_prices", agent_id))
    return Bid(job_id=job_id, agent_id=agent_id, price=price, effective_bid=float(effective))


async def remove_open(job_id: str) -> None:
    r = get_redis()
    await r.zrem(JOBS_OPEN_KEY, job_id)
