"""The formal weave.Evaluation — market allocation vs. baselines.

One Evaluation (held-out job dataset + metric scorer); each condition+seed
is one evaluate() call with the allocator name as the Model — all
conditions land side-by-side in the Weave UI, every row links to the
underlying job trace.

Protocol per (condition, seed): scoped reset → register the fleet →
warm-up (market condition only: reputations + clearing prices need
history) → run every held-out job through the FULL lifecycle (escrow,
guardrail, referee, settlement) — only the assignment rule differs.

Run:  cd backend && uv run python -m canopy.eval.run_eval [--quick]
      [--seeds 42 43 44] [--conditions market round_robin ...] [--limit N]

Writes documentation/results.md with the headline table.
"""
import argparse
import asyncio
import os
import random
import statistics
from collections import defaultdict
from pathlib import Path

os.environ.setdefault("WEAVE_PARALLELISM", "1")  # market state evolves job-to-job

import weave

from canopy.agents.skills import GENERALIST_PROFILE
from canopy.agents.strategies import Generalist
from canopy.agents.worker import Worker
from canopy.config import settings
from canopy.eval.allocators import CONDITIONS, BaselineAllocator
from canopy.eval.heldout import heldout_jobs
from canopy.eval.stats import convergence_point, specialization_index
from canopy.jobs.schema import Job, JobStatus
from canopy.jobs.seed import seed_jobs
from canopy.market import ledger, matching, order_book, registry
from canopy.redis_client import get_redis
from canopy.sim.engine import Market, build_fleet, reset_market
from canopy.weave_setup import init_weave

RESULTS_PATH = Path(__file__).resolve().parents[3] / "documentation" / "results.md"

# live context for the current evaluate() call (Model fields must stay
# serializable, so the live market handle lives here, not on the model)
CONTEXT: dict = {"market": None, "allocator": None}


class AllocatorModel(weave.Model):
    condition: str
    seed: int

    @weave.op
    async def predict(
        self,
        job_id: str,
        spec: str,
        ground_truth: str,
        category: str,
        hops: int,
        bounty_cap: float,
    ) -> dict:
        market: Market = CONTEXT["market"]
        job = Job(
            id=job_id,
            spec=spec,
            category=category,
            hops=hops,
            bounty_cap=bounty_cap,
            client_id="human",
            ground_truth=ground_truth,
        )
        before = await ledger.balance("human")
        if self.condition == "market":
            done, result = await market.run_job(job)
        else:
            with weave.thread(job.id):
                await order_book.post_job(job)
                bid = await CONTEXT["allocator"].assign(job)
                done, result = await market.finish_job(job, bid)
        paid = before - await ledger.balance("human")
        return {
            "score": result.score if result and result.score is not None else 0.0,
            "paid": round(paid, 4),
            "rejected": done.status == JobStatus.REJECTED,
            "winner": done.winner_id,
            "status": str(done.status),
        }


@weave.op
def allocation_metrics(output: dict) -> dict:
    return {
        "quality": output["score"],
        "accuracy": output["score"] >= settings.score_threshold,
        "paid": output["paid"],
        "rejected": output["rejected"],
    }


def eval_fleet(rng: random.Random) -> list[Worker]:
    """Standard fleet + a premium-tier solo generalist (the B2 fixed agent;
    it also bids in the market condition, where price keeps it honest)."""
    fleet = build_fleet(rng, mock=False, sabotage=False)
    prem = Worker(
        "worker-prem", strategy=Generalist(random.Random(rng.random())), model_tier="premium"
    )
    prem.skill_text = GENERALIST_PROFILE + " Premium tier: deeper reasoning."
    fleet.append(prem)
    return fleet


async def prepare(condition: str, seed: int, warmup: int) -> dict:
    """Reset → fleet → (market-only) warm-up. Returns descriptive stats."""
    rng = random.Random(seed)
    await reset_market()
    await matching.create_index()
    await registry.register_human()
    fleet = eval_fleet(rng)
    market = Market(fleet, mock=False, rng=rng)
    for w in fleet:
        await registry.register_agent(w.id, w.id, w.model_tier, w.strategy.name)
        await matching.index_agent_skills(w.id, w.skill_text)

    desc: dict = {}
    if condition == "market" and warmup:
        for job in seed_jobs(warmup, rng):
            job.id = f"warm-{job.id}"
            await market.run_job(job)
        desc["specialization"] = specialization_index(market.job_log)
        r = get_redis()
        conv = {}
        async for key in r.scan_iter(match="prices:*", count=200):
            series = [float(m.rsplit(":", 1)[1]) for m in await r.zrange(key, 0, -1)]
            point = convergence_point(series)
            if point is not None:
                conv[key.removeprefix("prices:")] = f"job {point + 1}/{len(series)}"
        desc["convergence_to_±10%"] = conv
        market.job_log.clear()  # held-out metrics must not include warm-up

    CONTEXT["market"] = market
    CONTEXT["allocator"] = (
        None if condition == "market" else BaselineAllocator(condition, fleet, rng)
    )
    return desc


def fmt(mean: float, std: float, digits: int = 3) -> str:
    return f"{mean:.{digits}f} ± {std:.{digits}f}"


async def main(conditions: list[str], seeds: list[int], limit: int | None, warmup: int) -> None:
    init_weave()
    rows = [
        {
            "job_id": j.id,
            "spec": j.spec,
            "ground_truth": j.ground_truth,
            "category": j.category,
            "hops": j.hops,
            "bounty_cap": j.bounty_cap,
        }
        for j in heldout_jobs(limit=limit)
    ]
    evaluation = weave.Evaluation(
        name="canopy-allocator-eval", dataset=rows, scorers=[allocation_metrics]
    )

    # results[condition][metric] = [per-seed means]
    results: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    desc_stats: dict = {}
    for condition in conditions:
        for seed in seeds:
            print(f"\n=== {condition} / seed {seed} ===")
            desc = await prepare(condition, seed, warmup)
            if desc:
                desc_stats[f"seed {seed}"] = desc
            summary = await evaluation.evaluate(
                AllocatorModel(condition=condition, seed=seed)
            )
            m = summary["allocation_metrics"]
            quality = m["quality"]["mean"]
            paid = m["paid"]["mean"]
            results[condition]["quality"].append(quality)
            results[condition]["accuracy"].append(m["accuracy"]["true_fraction"])
            results[condition]["paid"].append(paid)
            results[condition]["qpd"].append(quality / paid if paid > 0 else 0.0)
            print(f"    quality={quality:.3f} paid/job={paid:.3f} qpd={quality/paid if paid else 0:.3f}")

    # ---- report -------------------------------------------------------------
    lines = [
        "# Canopy evaluation results — market vs. baselines",
        "",
        f"Formal `weave.Evaluation` (`canopy-allocator-eval`): {len(rows)} held-out jobs "
        f"(incl. {sum(1 for r in rows if r['category'] == 'extraction')} unseen-category), "
        f"seeds {seeds}, identical fleet/scorer/lifecycle — only the assignment rule differs.",
        "",
        "| condition | quality (mean±std) | accuracy | paid/job | quality-per-dollar |",
        "|---|---|---|---|---|",
    ]
    for cond in conditions:
        r = results[cond]
        std = lambda xs: statistics.stdev(xs) if len(xs) > 1 else 0.0
        lines.append(
            f"| **{cond}** | {fmt(statistics.mean(r['quality']), std(r['quality']))} "
            f"| {fmt(statistics.mean(r['accuracy']), std(r['accuracy']), 2)} "
            f"| {fmt(statistics.mean(r['paid']), std(r['paid']), 2)} "
            f"| {fmt(statistics.mean(r['qpd']), std(r['qpd']))} |"
        )
    if "market" in results:
        mq = statistics.mean(results["market"]["qpd"])
        for base in ("round_robin", "single_premium"):
            if base in results:
                bq = statistics.mean(results[base]["qpd"])
                if bq > 0:
                    lines.append("")
                    lines.append(
                        f"**Market vs {base}: {(mq / bq - 1) * 100:+.0f}% quality-per-dollar.**"
                    )
    if desc_stats:
        lines += ["", "## Market mechanism stats (warm-up runs)", "```", str(desc_stats), "```"]
    RESULTS_PATH.write_text("\n".join(lines) + "\n")
    print(f"\nresults → {RESULTS_PATH}")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Canopy allocator evaluation")
    p.add_argument("--conditions", nargs="*", default=CONDITIONS)
    p.add_argument("--seeds", nargs="*", type=int, default=[42, 43, 44])
    p.add_argument("--limit", type=int, default=None, help="cap held-out jobs (smoke test)")
    p.add_argument("--warmup", type=int, default=13)
    p.add_argument("--quick", action="store_true", help="1 seed, 6 jobs, warmup 6")
    args = p.parse_args()
    if args.quick:
        args.seeds, args.limit, args.warmup = [42], 6, 6
    asyncio.run(main(args.conditions, args.seeds, args.limit, args.warmup))
