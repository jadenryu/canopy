"""Settlement — score decides where the escrowed money goes.

score >= SCORE_THRESHOLD → escrow released to the worker, reputation up.
score <  SCORE_THRESHOLD → escrow refunded to the client, reputation down.
Either way the clearing price history (`prices:{category}` ZSET) and the
leaderboard move, and reputation updates via the EMA.

Phase 1 passes a placeholder score; Phase 2 wires the Weave referee
Scorer's output in here so payment + reputation derive from Weave scores.
"""
import time

import weave

from canopy.config import settings
from canopy.jobs.schema import Job, JobResult, JobStatus
from canopy.market import escrow, events, order_book
from canopy.market.reputation import update_reputation
from canopy.redis_client import get_redis


@weave.op
async def settle(job: Job, result: JobResult, score: float) -> Job:
    r = get_redis()
    paid = score >= settings.score_threshold

    if paid:
        amount = await escrow.release(job.id, job.winner_id)
        job.status = JobStatus.SETTLED
        await r.hincrby(f"agent:{job.winner_id}", "jobs_won", 1)
        # the settled price IS the clearing price observation for this category
        ts = time.time()
        await r.zadd(f"prices:{job.category}", {f"{job.id}:{amount:.4f}": ts})
        await events.emit(
            "price_update", {"category": job.category, "price": amount, "job_id": job.id}
        )
    else:
        amount = await escrow.refund(job.id, job.client_id)
        job.status = JobStatus.FAILED
        await r.hincrby(f"agent:{job.winner_id}", "jobs_failed", 1)

    await order_book.save_job(job)
    reputation = await update_reputation(job.winner_id, score)
    await events.emit(
        "settled" if paid else "failed",
        {
            "job_id": job.id,
            "agent_id": job.winner_id,
            "score": score,
            "amount": amount if paid else 0.0,
            "reputation": round(reputation, 4),
        },
    )
    return job


async def last_clearing_price(category: str) -> float | None:
    """Most recent settled price for a category (bid strategies read this)."""
    r = get_redis()
    latest = await r.zrange(f"prices:{category}", -1, -1)
    if not latest:
        return None
    return float(latest[0].rsplit(":", 1)[1])
