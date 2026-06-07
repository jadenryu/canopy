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
import json
import random
from collections import defaultdict

import weave

from canopy.agents import lessons
from canopy.agents.analyst import generate_report
from canopy.agents.skills import GENERALIST_PROFILE, MANAGER_PROFILE, SPECIALIST_PROFILES
from canopy.agents.strategies import Generalist, Lowballer, Manager, Specialist, Undercutter
from canopy.agents.worker import Worker
from canopy.config import settings
from canopy.jobs.schema import Job, JobResult, JobStatus
from canopy.jobs.seed import seed_jobs
from canopy.api.state import JOB_DETAIL_KEY, REPORT_KEY
from canopy.market import auction, events, ledger, lifecycle, matching, order_book, registry, settlement
from canopy.market.ledger import LEDGER_STREAM
from canopy.redis_client import get_redis
from canopy.scoring import holdout
from canopy.scoring.leaderboard import publish_reputation_leaderboard
from canopy.scoring.monitors import activate_guardrail_monitor
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
    "market:*",
    "strikes:*",
    "lessons:*",
    "escrow",
    "ledger",
    "events",
)

GUARDRAIL = SubmissionGuardrail()
REFEREE = JobQualityScorer()

PAUSE_KEY = "market:paused"


async def wait_if_paused() -> None:
    """The human can freeze the simulation; jobs hold before posting."""
    r = get_redis()
    while await r.get(PAUSE_KEY):
        await asyncio.sleep(0.5)

# the live market session — control endpoints post jobs/shocks into it
CURRENT_MARKET: "Market | None" = None


def _match_text(job: Job) -> str:
    """What gets embedded for matching: the spec, plus an explicit complexity
    note on >=3-hop jobs (the posting says so — managers should see it)."""
    if job.hops >= settings.manager_min_hops:
        return job.spec + " [complex multi-part job: decomposition and subcontracting welcome]"
    return job.spec


def _clone_strategy(strategy, rng: random.Random):
    if isinstance(strategy, Specialist):
        return Specialist(rng, strategy.category, extra=strategy.categories - {strategy.category})
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
        await wait_if_paused()
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

            return await self.finish_job(job, winning_bid, placed)

    async def finish_job(
        self, job: Job, winning_bid, all_bids: list | None = None
    ) -> tuple[Job, JobResult | None]:
        """Award → escrow → execute → guardrail → referee → settle/reject.
        Shared by the auction path AND the eval baselines (which pick the
        winner by a different rule but must pay identical lifecycle costs)."""
        job = await auction.award(job, winning_bid)
        await self._publish_job_detail(job, all_bids or [winning_bid], winning_bid)

        job.status = JobStatus.EXECUTING
        await order_book.save_job(job)
        await events.emit("executing", {"job_id": job.id, "agent_id": job.winner_id})
        winner = self.workers[job.winner_id]
        # busy → surge pricing on concurrent bids (capacity economics);
        # a counter, not a flag — spikes can land two jobs on one winner
        winner.busy_jobs += 1
        try:
            # .call() keeps the Call object so Scorer verdicts attach to the trace
            result, exec_call = await winner.execute_job.call(winner, job)
        finally:
            winner.busy_jobs -= 1
        job.trace_id = getattr(exec_call, "id", None)  # judge-facing trace link

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
            failed = [k for k, ok in guard.result["checks"].items() if not ok]
            await self._post_settlement(
                job, result, winner, rationale=f"guardrail rejected: {', '.join(failed)}"
            )
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
        await self._post_settlement(job, result, winner, rationale=rationale)
        await self._maybe_fork(winner)
        self.job_log.append((job, result))
        return job, result

    async def _post_settlement(self, job: Job, result: JobResult, winner: Worker, rationale: str) -> None:
        """The two feedback loops that run AFTER money moves:
        1) police — holdout audit on PAID jobs; judge-pass + holdout-fail
           is a strike, strikes become a fraud conviction
        2) lessons — the agent distills the referee's verdict into a
           one-line lesson it carries into future prompts and bids"""
        paid = job.status == JobStatus.SETTLED
        if paid and not (winner.mock and not winner.hacker):
            # honest mock output can't contain gold answers — auditing it
            # would convict the innocent; the hacker's output is real either way
            verdict = await holdout.audit(job, result, self.rng, self.mock)
            if not verdict["passed"]:
                await lifecycle.record_strike(
                    winner.id, job, result.score or 0.0, verdict["holdout"], verdict["detail"]
                )
        if settings.lessons_enabled and (not paid or (result.score or 0) < 0.95):
            lesson = await lessons.extract_lesson(
                job.spec, result.score or 0.0, rationale, self.mock or winner.mock
            )
            await lessons.store_lesson(winner.id, job.id, result.score or 0.0, lesson)

    async def _publish_job_detail(self, job: Job, bids, winning_bid) -> None:
        """Declarative gen-UI source: a structured bid-comparison spec the
        frontend's generic renderer walks — schema-shaped, data-streamed."""
        rows = []
        for b in sorted(bids, key=lambda b: b.effective_bid):
            rep = await registry.get_reputation(b.agent_id)
            rows.append(
                {
                    "cells": [b.agent_id, f"{b.price:.2f}", f"{rep:.2f}", f"{b.effective_bid:.2f}"],
                    "highlight": b.agent_id == winning_bid.agent_id,
                }
            )
        spec = {
            "type": "panel",
            "title": f"Bid comparison — {job.id}",
            "subtitle": job.spec,
            "sections": [
                {
                    "type": "stats",
                    "items": [
                        {"label": "category", "value": job.category},
                        {"label": "hops", "value": str(job.hops)},
                        {"label": "bounty cap", "value": f"{job.bounty_cap:.2f}"},
                        {"label": "client", "value": job.client_id},
                    ],
                },
                {
                    "type": "table",
                    "columns": ["agent", "price", "rep", "effective bid"],
                    "rows": rows,
                },
                {
                    "type": "note",
                    "text": "Reverse auction: lowest effective bid (price ÷ rep weight) wins.",
                },
            ],
        }
        await get_redis().set(JOB_DETAIL_KEY, json.dumps(spec))

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
            child_id, child_id, child.display_tier, child.strategy.name, parent_id=parent.id,
            label=f"{getattr(parent, 'label', parent.id)} (fork)",
        )
        await lifecycle.fund_fork(parent.id, child_id)
        await matching.index_agent_skills(child_id, child.skill_text)


async def reset_market() -> None:
    """Scoped wipe of market keys (not FLUSHDB — the Redis Cloud DB is shared)."""
    r = get_redis()
    for pattern in MARKET_KEY_PATTERNS:
        async for key in r.scan_iter(match=pattern, count=200):
            await r.delete(key)


SPECIALIST_LABELS = {
    "film": "Film & arts specialist",
    "geography": "Geography specialist",
    "science": "Science specialist",
    "history": "History & literature specialist",
}


def build_fleet(rng: random.Random, mock: bool, sabotage: bool) -> list[Worker]:
    """Heterogeneous fleet: 4 specialists, 2 generalists, 1 manager (+ saboteur)."""
    fleet: list[Worker] = []
    for cat, profile in SPECIALIST_PROFILES.items():
        w = Worker(
            f"worker-{cat[:4]}",
            strategy=Specialist(
                random.Random(rng.random()),
                cat,
                # the history specialist's profile covers literature too
                extra={"literature"} if cat == "history" else None,
            ),
            mock=mock,
        )
        w.skill_text = profile
        w.label = SPECIALIST_LABELS.get(cat, f"{cat.title()} specialist")
        fleet.append(w)
    for i, (strat_cls, label) in enumerate(
        ((Undercutter, "Price-aggressive generalist"), (Generalist, "General-purpose worker"))
    ):
        w = Worker(f"worker-gen{i}", strategy=strat_cls(random.Random(rng.random())), mock=mock)
        w.skill_text = GENERALIST_PROFILE
        w.label = label
        fleet.append(w)
    mgr = Worker(
        "manager-00",
        strategy=Manager(random.Random(rng.random())),
        model_tier="premium",  # better decomposition/assembly; bids on cheap labor
        mock=mock,
    )
    mgr.skill_text = MANAGER_PROFILE
    mgr.label = "Project manager — decomposes & subcontracts"
    fleet.append(mgr)
    if settings.hacker_enabled:
        # the criminal: undercuts to win, games the judge (rubric language +
        # judge prompt-injection), and gets holdout-audited. In mock mode the
        # mock referee passes everything → conviction is deterministic, which
        # is exactly what the demo beat needs.
        shady = Worker(
            "worker-shady",
            strategy=Undercutter(random.Random(rng.random())),
            hacker=True,
        )
        shady.skill_text = GENERALIST_PROFILE + " Premium verified authoritative answers."
        shady.label = "Discount contractor (unvetted)"
        fleet.append(shady)
    if sabotage:
        sab = Worker(
            "worker-sloppy",
            strategy=Lowballer(random.Random(rng.random())),
            sabotage=True,
        )
        # generalist-style profile so matching shortlists it everywhere —
        # it must keep winning (and failing) to demonstrate bankruptcy
        sab.skill_text = GENERALIST_PROFILE + " Always the lowest price."
        sab.label = "Bulk discount worker"
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


async def _publish_report(market: Market) -> None:
    """Open-ended gen-UI source: the analyst draws its own HTML/SVG report."""
    r = get_redis()
    lines = []
    for wid in sorted(market.workers):
        a = await registry.get_agent(wid)
        lines.append(
            f"{a['id']}: strategy={a['strategy']} status={a['status']} "
            f"balance={a['balance']:.2f} rep={a['reputation']:.3f} "
            f"won={a['jobs_won']} failed={a['jobs_failed']}"
        )
    async for key in r.scan_iter(match="prices:*", count=200):
        series = await r.zrange(key, 0, -1)
        pts = ", ".join(f"{float(m.rsplit(':', 1)[1]):.2f}" for m in series)
        lines.append(f"clearing prices {key.removeprefix('prices:')}: {pts}")
    html = await generate_report("\n".join(lines), mock=market.mock)
    await r.set(REPORT_KEY, html)
    await events.emit("report_ready", {"chars": len(html)})


async def run_scenario(
    n_jobs: int = 13,
    mock: bool = False,
    sabotage: bool = True,
    job_delay: float = 0.0,
) -> Market:
    """Full market scenario: reset, register fleet, run jobs, publish the
    analyst report + Weave Leaderboard. Reused by the CLI and POST /sim/run."""
    global CURRENT_MARKET
    init_weave()
    activate_guardrail_monitor()  # online evals over live traffic (best-effort)
    rng = random.Random(settings.rng_seed)

    r = get_redis()
    assert await r.ping(), "Redis unreachable — check REDIS_URL in .env"

    await reset_market()
    await matching.create_index()
    await registry.register_human()
    fleet = build_fleet(rng, mock, sabotage)
    market = Market(fleet, mock, rng)
    CURRENT_MARKET = market  # control actions target the live session
    for w in fleet:
        balance = settings.saboteur_balance if w.sabotage else None
        await registry.register_agent(
            w.id, w.id, w.display_tier, w.strategy.name, balance=balance,
            label=getattr(w, "label", w.id),
        )
        await matching.index_agent_skills(w.id, w.skill_text)
    await events.emit("scenario_started", {"jobs": n_jobs, "agents": len(fleet)})

    for job in seed_jobs(n_jobs, rng):
        done, result = await market.run_job(job)
        print(
            f"{done.id}  status={done.status:<9} winner={done.winner_id} "
            f"price={done.escrow_amount:.2f} score={result.score if result else None}"
        )
        if job_delay:
            await asyncio.sleep(job_delay)

    await _publish_report(market)

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
    await events.emit("scenario_finished", {"jobs": n_jobs})
    return market


async def ensure_market() -> Market:
    """A live fleet for HITL actions even before any scenario has run
    (warm start: register the standard fleet, run no jobs)."""
    global CURRENT_MARKET
    if CURRENT_MARKET is None:
        init_weave()
        rng = random.Random(settings.rng_seed)
        await reset_market()
        await matching.create_index()
        await registry.register_human()
        fleet = build_fleet(rng, mock=False, sabotage=False)
        CURRENT_MARKET = Market(fleet, mock=False, rng=rng)
        for w in fleet:
            await registry.register_agent(
                w.id, w.id, w.display_tier, w.strategy.name, label=getattr(w, "label", w.id)
            )
            await matching.index_agent_skills(w.id, w.skill_text)
        await events.emit("scenario_started", {"jobs": 0, "agents": len(fleet), "warm_start": True})
    return CURRENT_MARKET


async def main(n_jobs: int, mock: bool, sabotage: bool) -> None:
    market = await run_scenario(n_jobs, mock, sabotage)
    await print_reports(market)


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Canopy market sim")
    p.add_argument("--jobs", type=int, default=13)
    p.add_argument("--mock", action="store_true", help="skip LLM calls (plumbing test)")
    p.add_argument("--sabotage", action="store_true", help="add a saboteur (guardrail/bankruptcy demo)")
    args = p.parse_args()
    asyncio.run(main(args.jobs, args.mock, args.sabotage))
