"""Phase 1 sim — N jobs through the full market lifecycle.

post → bid → award (escrow) → execute → settle, all on Redis primitives,
every state change emitted to the events Stream + Pub/Sub. Each job runs
inside weave.thread(job_id) so the trace reads job=thread, bids/exec=turns.

Run:  cd backend && uv run python -m canopy.sim.engine [--jobs 6] [--agents 4] [--mock]

✅ Phase 1 gate: jobs posted, agents bid, winner awarded from the ZSET,
escrow moves, the ledger Stream records transactions, balances update.
"""
import argparse
import asyncio
import random

import weave

from canopy.agents.strategies import STRATEGIES
from canopy.agents.worker import Worker
from canopy.config import settings
from canopy.jobs.schema import Job, JobStatus
from canopy.jobs.seed import seed_jobs
from canopy.market import auction, events, order_book, registry, settlement
from canopy.market.ledger import LEDGER_STREAM
from canopy.redis_client import get_redis
from canopy.weave_setup import init_weave

# Phase 1 placeholder: every delivered job "passes". Phase 2 replaces this
# with the Weave referee Scorer's score (which then sets pay + reputation).
PLACEHOLDER_SCORE = 1.0

MARKET_KEY_PATTERNS = (
    "agent:*",
    "agents:*",
    "job:*",
    "jobs:*",
    "prices:*",
    "escrow",
    "ledger",
    "events",
)


async def reset_market() -> None:
    """Scoped wipe of market keys (not FLUSHDB — the Redis Cloud DB is shared)."""
    r = get_redis()
    for pattern in MARKET_KEY_PATTERNS:
        async for key in r.scan_iter(match=pattern, count=200):
            await r.delete(key)


def build_workers(n: int, rng: random.Random, mock: bool) -> list[Worker]:
    """Heterogeneous fleet: strategies round-robin, one premium-tier agent."""
    workers = []
    for i in range(n):
        strategy_cls = STRATEGIES[i % len(STRATEGIES)]
        tier = "premium" if i == n - 1 else "cheap"
        workers.append(
            Worker(
                agent_id=f"worker-{i:02d}",
                strategy=strategy_cls(random.Random(rng.random())),
                model_tier=tier,
                mock=mock,
            )
        )
    return workers


async def run_job(job: Job, workers: list[Worker]) -> Job:
    """One full transaction: post → bid → award/escrow → execute → settle."""
    with weave.thread(job.id):
        await order_book.post_job(job)

        # open call: every active agent prices the job concurrently
        bids = await asyncio.gather(*(w.bid(job) for w in workers))
        for bid in filter(None, bids):
            await order_book.place_bid(bid)

        winning_bid = await auction.run_auction(job.id)
        if winning_bid is None:
            job.status = JobStatus.FAILED
            await order_book.save_job(job)
            await events.emit("failed", {"job_id": job.id, "reason": "no_bids"})
            return job

        job = await auction.award(job, winning_bid)

        job.status = JobStatus.EXECUTING
        await order_book.save_job(job)
        await events.emit("executing", {"job_id": job.id, "agent_id": job.winner_id})
        winner = next(w for w in workers if w.id == job.winner_id)
        result = await winner.execute_job(job)

        job.status = JobStatus.VERIFYING
        await order_book.save_job(job)
        return await settlement.settle(job, result, PLACEHOLDER_SCORE)


async def print_summary(workers: list[Worker]) -> None:
    r = get_redis()
    print("\n=== market summary ===")
    print(f"{'agent':<12} {'strategy':<12} {'tier':<8} {'balance':>9} {'rep':>6} {'won':>4} {'fail':>4}")
    for w in workers:
        a = await registry.get_agent(w.id)
        print(
            f"{a['id']:<12} {a['strategy']:<12} {a['model_tier']:<8} "
            f"{a['balance']:>9.2f} {a['reputation']:>6.3f} {a['jobs_won']:>4} {a['jobs_failed']:>4}"
        )
    human = await registry.get_agent("human")
    print(f"{'human':<12} {'(client)':<12} {'':<8} {human['balance']:>9.2f}")
    ledger_len = await r.xlen(LEDGER_STREAM)
    events_len = await r.xlen(events.EVENTS_STREAM)
    clearing = await settlement.last_clearing_price("multi-hop-qa")
    print(f"\nledger entries: {ledger_len} | events: {events_len} | last clearing price: {clearing}")


async def main(n_jobs: int, n_agents: int, mock: bool) -> None:
    init_weave()
    rng = random.Random(settings.rng_seed)

    r = get_redis()
    assert await r.ping(), "Redis unreachable — check REDIS_URL in .env"

    await reset_market()
    await registry.register_human()
    workers = build_workers(n_agents, rng, mock)
    for w in workers:
        await registry.register_agent(w.id, w.id, w.model_tier, w.strategy.name)

    for job in seed_jobs(n_jobs, rng):
        settled = await run_job(job, workers)
        print(
            f"{settled.id}  status={settled.status:<8} winner={settled.winner_id} "
            f"price={settled.escrow_amount:.2f}"
        )

    await print_summary(workers)


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Canopy Phase 1 market sim")
    p.add_argument("--jobs", type=int, default=6)
    p.add_argument("--agents", type=int, default=4)
    p.add_argument("--mock", action="store_true", help="skip LLM calls (plumbing test)")
    args = p.parse_args()
    asyncio.run(main(args.jobs, args.agents, args.mock))
