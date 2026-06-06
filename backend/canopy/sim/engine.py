"""Market sim — N jobs through the full lifecycle, refereed by Weave.

post → bid → award (escrow) → execute → guardrail gate → referee score →
settle/reject, all on Redis primitives, every state change emitted to the
events Stream + Pub/Sub. Each job runs inside weave.thread(job_id) so the
trace reads job=thread, bids/exec=turns; Scorer verdicts attach to the
execute_job call as Weave Feedback via call.apply_scorer().

Run:  cd backend && uv run python -m canopy.sim.engine \
          [--jobs 6] [--agents 4] [--mock] [--sabotage]

✅ Phase 2 gate: referee scores visible in Weave set payment + reputation;
--sabotage makes a deliberately-bad submission get rejected by the
guardrail BEFORE payment; the Weave Leaderboard ranks agents by score.
"""
import argparse
import asyncio
import random

import weave

from canopy.agents.strategies import STRATEGIES, Lowballer
from canopy.agents.worker import Worker
from canopy.config import settings
from canopy.jobs.schema import Job, JobResult, JobStatus
from canopy.jobs.seed import seed_jobs
from canopy.market import auction, events, order_book, registry, settlement
from canopy.market.ledger import LEDGER_STREAM
from canopy.redis_client import get_redis
from canopy.scoring.leaderboard import publish_reputation_leaderboard
from canopy.scoring.scorers import JobQualityScorer, SubmissionGuardrail
from canopy.weave_setup import init_weave

# --mock plumbing runs skip the LLM judge and assume passing work.
MOCK_SCORE = 1.0

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


GUARDRAIL = SubmissionGuardrail()
REFEREE = JobQualityScorer()


async def run_job(job: Job, workers: list[Worker], mock: bool) -> tuple[Job, JobResult | None]:
    """One full transaction: post → bid → award/escrow → execute →
    guardrail gate → referee score → settle (or reject pre-payment)."""
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
            return job, None

        job = await auction.award(job, winning_bid)

        job.status = JobStatus.EXECUTING
        await order_book.save_job(job)
        await events.emit("executing", {"job_id": job.id, "agent_id": job.winner_id})
        winner = next(w for w in workers if w.id == job.winner_id)
        # .call() keeps the Call object so Scorer verdicts attach to the trace
        result, exec_call = await winner.execute_job.call(winner, job)

        job.status = JobStatus.VERIFYING
        await order_book.save_job(job)

        # 1) guardrail at the submission boundary — runs BEFORE any payment
        guard = await exec_call.apply_scorer(GUARDRAIL)
        if not guard.result["passed"]:
            result.score, result.rationale = 0.0, "rejected by guardrail pre-payment"
            return await settlement.reject(job, result, guard.result["checks"]), result

        # 2) referee — its score IS the payment + reputation signal
        if mock:
            score, rationale = MOCK_SCORE, "mock run — referee skipped"
        else:
            verdict = await exec_call.apply_scorer(REFEREE)
            score, rationale = verdict.result["score"], verdict.result["rationale"]
        result.score, result.rationale = score, rationale
        await events.emit(
            "scored",
            {"job_id": job.id, "agent_id": job.winner_id, "score": score, "rationale": rationale},
        )
        return await settlement.settle(job, result, score), result


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


async def main(n_jobs: int, n_agents: int, mock: bool, sabotage: bool) -> None:
    init_weave()
    rng = random.Random(settings.rng_seed)

    r = get_redis()
    assert await r.ping(), "Redis unreachable — check REDIS_URL in .env"

    await reset_market()
    await registry.register_human()
    workers = build_workers(n_agents, rng, mock)
    if sabotage:
        # lowballs every auction, submits garbage → guardrail rejection demo
        workers.append(
            Worker(
                agent_id="worker-sloppy",
                strategy=Lowballer(random.Random(rng.random())),
                sabotage=True,
            )
        )
    for w in workers:
        await registry.register_agent(w.id, w.id, w.model_tier, w.strategy.name)

    jobs = seed_jobs(n_jobs, rng)
    records: dict[str, list[dict]] = {w.id: [] for w in workers}  # for the Leaderboard
    for job in jobs:
        done, result = await run_job(job, workers, mock)
        print(
            f"{done.id}  status={done.status:<9} winner={done.winner_id} "
            f"price={done.escrow_amount:.2f} score={result.score if result else None}"
        )
        if result is not None and result.score is not None:
            records[done.winner_id].append(
                {
                    "job_id": done.id,
                    "spec": done.spec,
                    "output": result.output,
                    "score": result.score,
                }
            )

    await print_summary(workers)

    if not mock:
        # reputation ranking as a Weave-native, eval-backed Leaderboard
        uri = publish_reputation_leaderboard(
            [{"job_id": j.id, "spec": j.spec} for j in jobs], records
        )
        print(f"\nWeave Leaderboard: {uri}")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Canopy market sim")
    p.add_argument("--jobs", type=int, default=6)
    p.add_argument("--agents", type=int, default=4)
    p.add_argument("--mock", action="store_true", help="skip LLM calls (plumbing test)")
    p.add_argument("--sabotage", action="store_true", help="add a saboteur (guardrail demo)")
    args = p.parse_args()
    asyncio.run(main(args.jobs, args.agents, args.mock, args.sabotage))
