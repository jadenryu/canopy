"""Settlement — score decides where the escrowed money goes.

score >= SCORE_THRESHOLD → escrow released to the worker, reputation up.
score <  SCORE_THRESHOLD → escrow refunded to the client, reputation down.
Either way the clearing price history (`prices:{category}` ZSET) and the
leaderboard move, and reputation updates via the EMA.

The score comes from the Weave referee Scorer (JobQualityScorer) — payment
+ reputation derive from Weave scores. reject() is the guardrail path:
work that fails the submission bar is refunded BEFORE any payment.
"""
import time

import weave

from canopy.config import settings
from canopy.jobs.schema import Job, JobResult, JobStatus
from canopy.market import escrow, events, lifecycle, order_book
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
        # the settled price IS the clearing price observation for this
        # (category, complexity) pair — mixing hop counts would muddy the series
        ts = time.time()
        await r.zadd(price_key(job.category, job.hops), {f"{job.id}:{amount:.4f}": ts})
        await events.emit(
            "price_update",
            {"category": job.category, "hops": job.hops, "price": amount, "job_id": job.id},
        )
    else:
        amount = await escrow.refund(job.id, job.client_id)
        job.status = JobStatus.FAILED
        await r.hincrby(f"agent:{job.winner_id}", "jobs_failed", 1)
        # Scorer failure → balance slash → (eventually) bankruptcy
        await lifecycle.penalize_failure(job.winner_id, job.id, "referee_fail")
        await lifecycle.check_bankruptcy(job.winner_id)

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


@weave.op
async def reject(job: Job, result: JobResult, checks: dict) -> Job:
    """Guardrail fail at the submission boundary: refund BEFORE payment,
    reputation penalty, status=rejected. No escrow ever reaches the worker."""
    r = get_redis()
    await escrow.refund(job.id, job.client_id)
    job.status = JobStatus.REJECTED
    await order_book.save_job(job)
    await r.hincrby(f"agent:{job.winner_id}", "jobs_failed", 1)
    # guardrail rejection → balance slash → (eventually) bankruptcy
    await lifecycle.penalize_failure(job.winner_id, job.id, "guardrail_reject")
    await lifecycle.check_bankruptcy(job.winner_id)
    reputation = await update_reputation(job.winner_id, 0.0)
    await events.emit(
        "rejected",
        {
            "job_id": job.id,
            "agent_id": job.winner_id,
            "checks": checks,
            "reputation": round(reputation, 4),
        },
    )
    return job


def price_key(category: str, hops: int) -> str:
    return f"prices:{category}:h{hops}"


async def last_clearing_price(category: str, hops: int) -> float | None:
    """Most recent settled price for (category, hops) — bid strategies read this."""
    r = get_redis()
    latest = await r.zrange(price_key(category, hops), -1, -1)
    if not latest:
        return None
    return float(latest[0].rsplit(":", 1)[1])
