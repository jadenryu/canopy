"""Market sim — heterogeneous fleet, RedisVL matching, subcontracting,
fork & bankruptcy, refereed by Weave.

Lifecycle per job: post → RedisVL shortlist → bid → award (escrow) →
execute (managers decompose + subcontract recursively) → guardrail gate →
referee score → settle/reject (+ penalties → bankruptcy; surplus → fork).
All state on Redis primitives; every change emitted to Stream + Pub/Sub.
Each job runs inside weave.thread(job_id); Scorer verdicts attach to the
execute_job call as Weave Feedback.

Run:  cd backend && uv run python -m canopy.sim.engine \
          [--jobs 13] [--mock] [--sabotage]

✅ Phase 3 gate: clearing price converges per category; ≥1 specialist
dominates its niche; scorer-failure penalties drive ≥1 bankruptcy;
subcontracting yields a multi-level hiring graph.
"""
import argparse
import asyncio
import random
from collections import defaultdict

import weave

from canopy.agents.skills import GENERALIST_PROFILE, MANAGER_PROFILE, SPECIALIST_PROFILES
from canopy.agents.strategies import Generalist, Lowballer, Manager, Specialist, Undercutter
from canopy.agents.worker import Worker
from canopy.config import settings
from canopy.jobs.schema import Job, JobResult, JobStatus
from canopy.jobs.seed import seed_jobs
from canopy.market import auction, events, ledger, lifecycle, matching, order_book, registry, settlement
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
    "skill:*",
    "escrow",
    "ledger",
    "events",
)

GUARDRAIL = SubmissionGuardrail()
REFEREE = JobQualityScorer()


def _match_text(job: Job) -> str:
    """What gets embedded for matching: the spec, plus an explicit complexity
    note on >=3-hop jobs (the posting says so — managers should see it)."""
    if job.hops >= settings.manager_min_hops:
        return job.spec + " [complex multi-part job: decomposition and subcontracting welcome]"
    return job.spec


def _clone_strategy(strategy, rng: random.Random):
    if isinstance(strategy, Specialist):
        return Specialist(rng, strategy.category)
    return type(strategy)(rng)


class Market:
    """Holds the live fleet and runs jobs end-to-end. Passed to managers
    (worker.market) so they can post sub-jobs — recursive hiring."""

    def __init__(self, workers: list[Worker], mock: bool, rng: random.Random):
        self.workers: dict[str, Worker] = {w.id: w for w in workers}
        self.mock = mock
        self.rng = rng
        self.job_log: list[tuple[Job, JobResult | None]] = []
        for w in workers:
            w.market = self

    async def _collect_bids(self, job: Job, bidder_ids: list[str]):
        bidders = [self.workers[a] for a in bidder_ids if a in self.workers]
        bids = await asyncio.gather(*(w.bid(job) for w in bidders))
        return [b for b in bids if b is not None]

    async def run_job(self, job: Job) -> tuple[Job, JobResult | None]:
        with weave.thread(job.id):
            await order_book.post_job(job)
            active = set(await registry.active_agent_ids())

            # discovery: RedisVL shortlist; client never bids on its own job
            shortlist = await matching.match_agents(_match_text(job))
            eligible = [a for a in shortlist if a in active and a != job.client_id]
            placed = await self._collect_bids(job, eligible)
            if not placed:  # everyone declined → fall back to an open call
                eligible = [a for a in active if a != job.client_id]
                placed = await self._collect_bids(job, eligible)

            for bid in placed:
                await order_book.place_bid(bid)
            winning_bid = await auction.run_auction(job.id)
            if winning_bid is None:
                job.status = JobStatus.FAILED
                await order_book.save_job(job)
                await events.emit("failed", {"job_id": job.id, "reason": "no_bids"})
                self.job_log.append((job, None))
                return job, None

            job = await auction.award(job, winning_bid)

            job.status = JobStatus.EXECUTING
            await order_book.save_job(job)
            await events.emit("executing", {"job_id": job.id, "agent_id": job.winner_id})
            winner = self.workers[job.winner_id]
            # .call() keeps the Call object so Scorer verdicts attach to the trace
            result, exec_call = await winner.execute_job.call(winner, job)

            # solo workers burn model cost per hop; a manager's costs are the
            # real escrow payments to its subcontractors (already debited)
            if not winner.is_manager:
                cost = winner.est_cost(job)
                await ledger.debit(winner.id, cost)
                await ledger.record(winner.id, "openai", cost, job.id, "execution_cost")

            job.status = JobStatus.VERIFYING
            await order_book.save_job(job)

            # 1) guardrail at the submission boundary — runs BEFORE any payment
            guard = await exec_call.apply_scorer(GUARDRAIL)
            if not guard.result["passed"]:
                result.score, result.rationale = 0.0, "rejected by guardrail pre-payment"
                job = await settlement.reject(job, result, guard.result["checks"])
                self.job_log.append((job, result))
                return job, result

            # 2) referee — its score IS the payment + reputation signal
            if self.mock:
                score, rationale = MOCK_SCORE, "mock run — referee skipped"
            else:
                verdict = await exec_call.apply_scorer(REFEREE)
                score, rationale = verdict.result["score"], verdict.result["rationale"]
            result.score, result.rationale = score, rationale
            await events.emit(
                "scored",
                {"job_id": job.id, "agent_id": job.winner_id, "score": score, "rationale": rationale},
            )
            job = await settlement.settle(job, result, score)
            await self._maybe_fork(winner)
            self.job_log.append((job, result))
            return job, result

    async def _maybe_fork(self, parent: Worker) -> None:
        if not await lifecycle.check_fork(parent.id):
            return
        n = sum(1 for wid in self.workers if wid.startswith(f"{parent.id}-f")) + 1
        child_id = f"{parent.id}-f{n}"
        child = Worker(
            child_id,
            strategy=_clone_strategy(parent.strategy, random.Random(self.rng.random())),
            model_tier=parent.model_tier,
            mock=parent.mock,
        )
        child.market = self
        child.skill_text = parent.skill_text
        self.workers[child_id] = child
        await registry.register_agent(
            child_id, child_id, child.model_tier, child.strategy.name, parent_id=parent.id
        )
        await lifecycle.fund_fork(parent.id, child_id)
        await matching.index_agent_skills(child_id, child.skill_text)


async def reset_market() -> None:
    """Scoped wipe of market keys (not FLUSHDB — the Redis Cloud DB is shared)."""
    r = get_redis()
    for pattern in MARKET_KEY_PATTERNS:
        async for key in r.scan_iter(match=pattern, count=200):
            await r.delete(key)


def build_fleet(rng: random.Random, mock: bool, sabotage: bool) -> list[Worker]:
    """Heterogeneous fleet: 4 specialists, 2 generalists, 1 manager (+ saboteur)."""
    fleet: list[Worker] = []
    for cat, profile in SPECIALIST_PROFILES.items():
        w = Worker(
            f"worker-{cat[:4]}",
            strategy=Specialist(random.Random(rng.random()), cat),
            mock=mock,
        )
        w.skill_text = profile
        fleet.append(w)
    for i, strat_cls in enumerate((Undercutter, Generalist)):
        w = Worker(f"worker-gen{i}", strategy=strat_cls(random.Random(rng.random())), mock=mock)
        w.skill_text = GENERALIST_PROFILE
        fleet.append(w)
    mgr = Worker(
        "manager-00",
        strategy=Manager(random.Random(rng.random())),
        model_tier="premium",  # better decomposition/assembly; bids on cheap labor
        mock=mock,
    )
    mgr.skill_text = MANAGER_PROFILE
    fleet.append(mgr)
    if sabotage:
        sab = Worker(
            "worker-sloppy",
            strategy=Lowballer(random.Random(rng.random())),
            sabotage=True,
        )
        # generalist-style profile so matching shortlists it everywhere —
        # it must keep winning (and failing) to demonstrate bankruptcy
        sab.skill_text = GENERALIST_PROFILE + " Always the lowest price."
        fleet.append(sab)
    return fleet


async def print_reports(market: Market) -> None:
    r = get_redis()

    print("\n=== agents ===")
    print(f"{'agent':<16} {'strategy':<12} {'tier':<8} {'status':<9} {'balance':>9} {'rep':>6} {'won':>4} {'fail':>4}")
    for wid in sorted(market.workers):
        a = await registry.get_agent(wid)
        print(
            f"{a['id']:<16} {a['strategy']:<12} {a['model_tier']:<8} {a['status']:<9} "
            f"{a['balance']:>9.2f} {a['reputation']:>6.3f} {a['jobs_won']:>4} {a['jobs_failed']:>4}"
        )
    human = await registry.get_agent("human")
    print(f"{'human':<16} {'(client)':<12} {'':<8} {'':<9} {human['balance']:>9.2f}")

    print("\n=== clearing prices by (category, hops) ===")
    price_keys = sorted([k async for k in r.scan_iter(match="prices:*", count=200)])
    for key in price_keys:
        series = await r.zrange(key, 0, -1)
        prices = [f"{float(m.rsplit(':', 1)[1]):.2f}" for m in series]
        label = key.removeprefix("prices:")
        print(f"{label:<16} {' → '.join(prices)}")

    print("\n=== hiring graph ===")
    children = defaultdict(list)
    top = []
    for job, _ in market.job_log:
        if job.parent_job_id:
            children[job.parent_job_id].append(job)
        else:
            top.append(job)

    def show(job: Job, indent: int):
        who = job.winner_id or "—"
        print(f"{'  ' * indent}{job.client_id} → {who}  [{job.id}] {job.status} @ {job.escrow_amount:.2f}")
        for c in children.get(job.id, []):
            show(c, indent + 1)

    for job in top:
        show(job, 0)

    print("\n=== category dominance (wins) ===")
    wins: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for job, _ in market.job_log:
        if job.status == JobStatus.SETTLED and job.winner_id:
            wins[job.category][job.winner_id] += 1
    for cat, by_agent in sorted(wins.items()):
        ranked = sorted(by_agent.items(), key=lambda kv: -kv[1])
        print(f"{cat:<12} " + ", ".join(f"{a}×{n}" for a, n in ranked))

    ledger_len = await r.xlen(LEDGER_STREAM)
    events_len = await r.xlen(events.EVENTS_STREAM)
    print(f"\nledger entries: {ledger_len} | events: {events_len}")


async def main(n_jobs: int, mock: bool, sabotage: bool) -> None:
    init_weave()
    rng = random.Random(settings.rng_seed)

    r = get_redis()
    assert await r.ping(), "Redis unreachable — check REDIS_URL in .env"

    await reset_market()
    await matching.create_index()
    await registry.register_human()
    fleet = build_fleet(rng, mock, sabotage)
    market = Market(fleet, mock, rng)
    for w in fleet:
        balance = settings.saboteur_balance if w.sabotage else None
        await registry.register_agent(w.id, w.id, w.model_tier, w.strategy.name, balance=balance)
        await matching.index_agent_skills(w.id, w.skill_text)

    for job in seed_jobs(n_jobs, rng):
        done, result = await market.run_job(job)
        print(
            f"{done.id}  status={done.status:<9} winner={done.winner_id} "
            f"price={done.escrow_amount:.2f} score={result.score if result else None}"
        )

    await print_reports(market)

    if not mock:
        # reputation ranking as a Weave-native, eval-backed Leaderboard
        records: dict[str, list[dict]] = defaultdict(list)
        for job, result in market.job_log:
            if result is not None and result.score is not None and job.winner_id:
                records[job.winner_id].append(
                    {"job_id": job.id, "spec": job.spec, "output": result.output, "score": result.score}
                )
        uri = publish_reputation_leaderboard(
            [{"job_id": j.id, "spec": j.spec} for j, _ in market.job_log], dict(records)
        )
        print(f"\nWeave Leaderboard: {uri}")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Canopy market sim")
    p.add_argument("--jobs", type=int, default=13)
    p.add_argument("--mock", action="store_true", help="skip LLM calls (plumbing test)")
    p.add_argument("--sabotage", action="store_true", help="add a saboteur (guardrail/bankruptcy demo)")
    args = p.parse_args()
    asyncio.run(main(args.jobs, args.mock, args.sabotage))
