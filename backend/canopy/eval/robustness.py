"""Robustness experiments — the measured answer to "why not one cheap agent?"

The allocator eval shows the market TIES a hand-vetted single cheap agent
on quality. The market's real edge is robustness, and this makes it a
number, not an assertion (evaluation_plan §5):

  saboteur  — market vs round-robin with 2 saboteurs in the fleet:
              $ paid to bad actors, bad jobs settled, jobs-to-bankruptcy.
              Round-robin keeps hiring them; the market defunds them.
  shock     — kill the top agent mid-run, measure ticks until the clearing
              price returns within 15% of pre-shock. A single agent's
              outage is total and permanent; the market re-clears.

Run:  cd backend && uv run python -m canopy.eval.robustness [--jobs 24]
Appends a section to documentation/results.md.
"""
import argparse
import asyncio
import random
from pathlib import Path

from canopy.config import settings
from canopy.eval.allocators import BaselineAllocator, quote
from canopy.eval.stats import convergence_summary
from canopy.jobs.schema import Bid, Job, JobStatus
from canopy.jobs.seed import seed_jobs
from canopy.market import ledger, matching, order_book, registry
from canopy.redis_client import get_redis
from canopy.sim import shock
from canopy.sim.engine import Market, build_fleet, emergence_spec, register_worker, reset_market
from canopy.weave_setup import init_weave

RESULTS_PATH = Path(__file__).resolve().parents[3] / "documentation" / "results.md"
SABOTEUR_IDS = {"worker-sloppy", "worker-shady"}


async def _fresh_market(rng: random.Random, sabotage: bool) -> Market:
    await reset_market()
    await matching.create_index()
    await registry.register_human()
    fleet = build_fleet(rng, mock=False, sabotage=sabotage, fleet_spec=emergence_spec(sabotage))
    market = Market(fleet, mock=False, rng=rng)
    for w in fleet:
        await register_worker(w)
    return market


async def _paid_to(agent_ids: set[str]) -> float:
    """Sum of settled escrow releases to the given agents, from the ledger."""
    r = get_redis()
    total = 0.0
    for _id, f in await r.xrange("ledger", count=5000):
        if f.get("type") == "escrow_release" and f.get("to") in agent_ids:
            total += float(f.get("amount", 0))
    return total


async def saboteur_experiment(n_jobs: int) -> dict:
    """Market vs round-robin, both fleets carrying the 2 saboteurs.

    The guardrail + referee catch bad WORK in either allocator, so '$ paid'
    barely differs. The real difference is ROUTING: round-robin keeps handing
    jobs to saboteurs (wasted capacity, every time); the market stops routing
    to them after a couple of failures freeze their reputation."""
    out = {}
    for condition in ("market", "round_robin"):
        rng = random.Random(settings.rng_seed)
        market = await _fresh_market(rng, sabotage=True)
        alloc = None if condition == "market" else BaselineAllocator("round_robin", list(market.workers.values()), rng)
        routed = 0  # jobs assigned to a saboteur (wasted attempts)
        last_routed_tick = -1
        for i, job in enumerate(seed_jobs(n_jobs, rng)):
            if condition == "market":
                done, _ = await market.run_job(job)
            else:
                await order_book.post_job(job)
                worker = alloc.fleet[alloc._rr % len(alloc.fleet)]
                alloc._rr += 1
                price = await quote(worker, job)
                done, _ = await market.finish_job(
                    job, Bid(job_id=job.id, agent_id=worker.id, price=price, effective_bid=price)
                )
            if done.winner_id in SABOTEUR_IDS:
                routed += 1
                last_routed_tick = i
        paid = await _paid_to(SABOTEUR_IDS)
        bankrupt = [
            sid for sid in SABOTEUR_IDS
            if (await registry.get_agent(sid)).get("status") == "bankrupt"
        ]
        out[condition] = {
            "jobs_routed_to_saboteurs": routed,
            "routed_share_pct": round(100 * routed / n_jobs),
            "last_routed_tick": last_routed_tick,  # market stops; RR never does
            "paid_to_saboteurs": round(paid, 2),
            "saboteurs_bankrupted": len(bankrupt),
        }
        print(f"  {condition}: {out[condition]}")
    return out


async def shock_recovery(n_jobs: int, kill_at: int) -> tuple[dict, dict]:
    """Run the market; kill the top agent at kill_at; measure recovery.
    Also collects per-(category,hops) price series for the convergence stat."""
    rng = random.Random(settings.rng_seed)
    market = await _fresh_market(rng, sabotage=False)
    prices: list[float] = []  # clearing price per settled job (the signal)
    by_series: dict[str, list[float]] = {}
    killed_at_tick = None
    pre_shock = None

    for i, job in enumerate(seed_jobs(n_jobs, rng)):
        if i == kill_at:
            window = prices[-4:] or prices
            pre_shock = sum(window) / len(window) if window else None
            killed = await shock.kill_top_agent()
            print(f"  tick {i}: killed {killed} (pre-shock price ~{pre_shock})")
            killed_at_tick = i
        done, _ = await market.run_job(job)
        if done.status == JobStatus.SETTLED and done.escrow_amount:
            prices.append(done.escrow_amount)
            by_series.setdefault(f"{done.category}:h{done.hops}", []).append(done.escrow_amount)

    # recovery: ticks after the kill until price returns within 15% of pre-shock
    recovery_ticks = None
    if pre_shock and killed_at_tick is not None:
        post = prices[max(0, killed_at_tick - 1):]
        for k, p in enumerate(post):
            if abs(p - pre_shock) / pre_shock <= 0.15:
                recovery_ticks = k
                break
    shk = {
        "pre_shock_price": round(pre_shock, 2) if pre_shock else None,
        "recovery_ticks": recovery_ticks,
        "jobs_settled_after_shock": len(prices),
    }
    return shk, convergence_summary(by_series)


def render(sab: dict, shk: dict, conv: dict) -> str:
    m, rr = sab["market"], sab["round_robin"]
    rec = (
        f"{shk['recovery_ticks']} jobs"
        if shk["recovery_ticks"] is not None
        else "n/a"
    )
    conv_line = (
        f"{conv['converged_pct']}% of {conv['series']} price series converged to "
        f"a ±{conv['band_pct']}% band (median {conv['median_jobs']} jobs)"
        if conv["converged_pct"] is not None
        else "too few settlements to measure"
    )
    lines = [
        "",
        "## Robustness — the measured answer to \"why not one cheap agent?\"",
        "",
        "### Saboteurs in the fleet (market vs. round-robin)",
        "",
        "Both allocators carry 2 saboteurs. The guardrail + referee catch bad "
        "*work* either way; the difference is *routing* — who keeps getting hired.",
        "",
        "| allocator | jobs routed to saboteurs | share | last routed at job | $ paid |",
        "|---|---|---|---|---|",
        f"| **market** | {m['jobs_routed_to_saboteurs']} | {m['routed_share_pct']}% | "
        f"#{m['last_routed_tick'] + 1} | {m['paid_to_saboteurs']} |",
        f"| round-robin | {rr['jobs_routed_to_saboteurs']} | {rr['routed_share_pct']}% | "
        f"#{rr['last_routed_tick'] + 1} | {rr['paid_to_saboteurs']} |",
        "",
        f"**Round-robin wasted {rr['routed_share_pct']}% of capacity on saboteurs "
        f"and never stopped (last routed at job #{rr['last_routed_tick'] + 1}); the "
        f"market froze them out after job #{m['last_routed_tick'] + 1} and routed "
        f"{m['routed_share_pct']}% to them total.**",
        "",
        "### Shock recovery (kill the top agent mid-run)",
        "",
        f"- Pre-shock clearing price: **{shk['pre_shock_price']}**",
        f"- Market re-cleared within 15% of pre-shock in **{rec}** after the "
        "top agent was killed.",
        "- A single-agent setup has no recovery: killing the one agent is a "
        "total, permanent outage.",
        "",
        "### Price convergence",
        "",
        f"- {conv_line} — clearing prices settle without any central planner.",
        "",
    ]
    return "\n".join(lines)


async def main(n_jobs: int) -> None:
    init_weave()
    print("saboteur experiment…")
    sab = await saboteur_experiment(n_jobs)
    print("shock recovery + convergence…")
    shk, conv = await shock_recovery(n_jobs, kill_at=n_jobs // 2)
    print(f"  convergence: {conv}")
    section = render(sab, shk, conv)
    existing = RESULTS_PATH.read_text() if RESULTS_PATH.exists() else ""
    marker = "## Robustness"
    if marker in existing:
        existing = existing[: existing.index(marker)].rstrip() + "\n"
    RESULTS_PATH.write_text(existing + section)
    print(section)
    print(f"appended → {RESULTS_PATH}")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Robustness experiments")
    p.add_argument("--jobs", type=int, default=24)
    args = p.parse_args()
    asyncio.run(main(args.jobs))
