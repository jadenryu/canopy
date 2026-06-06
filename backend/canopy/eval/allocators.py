"""Allocators — the assignment rules under comparison.

Identical fleet, identical jobs, identical scorer; ONLY the rule that
decides "which agent does this job, at what price" differs:

  market         reverse auction (effective_bid = price / rep_weight)
  single_cheap   one fixed nano worker does everything (B1)
  single_premium one fixed premium worker does everything (B2)
  random         uniform-random active worker per job (B3)
  round_robin    cycle through workers in fixed order (B4)

Baselines pay the assigned agent's own quote (strategy margin × cost,
clamped) — no competitive pressure, which is exactly what the auction
adds. A None from the strategy (out-of-niche specialist) falls back to
a flat default margin: assignment rules don't get to decline.
"""
import random

import weave

from canopy.agents.worker import Worker
from canopy.config import settings
from canopy.jobs.schema import Bid, Job
from canopy.market.settlement import last_clearing_price

CONDITIONS = ["market", "single_cheap", "single_premium", "random", "round_robin"]

DEFAULT_MARGIN = 0.3  # quote when the agent's strategy would decline


async def quote(worker: Worker, job: Job) -> float:
    """The agent's own asking price absent an auction."""
    est = worker.est_cost(job)
    price = worker.strategy.price(
        job, est, await last_clearing_price(job.category, job.hops)
    )
    if price is None:
        price = est * (1 + DEFAULT_MARGIN)
    if worker.busy:
        price *= settings.busy_surge
    return min(max(price, settings.reserve_price), job.bounty_cap)


class BaselineAllocator:
    """Picks (worker, quoted price) for a job. kind != 'market' only —
    the market condition uses Market.run_job's real auction instead."""

    def __init__(self, kind: str, fleet: list[Worker], rng: random.Random):
        assert kind in CONDITIONS and kind != "market"
        self.kind = kind
        self.fleet = fleet
        self.rng = rng
        self._rr = 0
        # fixed agents for the single-agent baselines
        self.cheap = next(
            w for w in fleet if w.model_tier == "cheap" and not w.is_manager
        )
        self.premium = next(
            w for w in fleet if w.model_tier == "premium" and not w.is_manager
        )

    @weave.op
    async def assign(self, job: Job) -> Bid:
        if self.kind == "single_cheap":
            worker = self.cheap
        elif self.kind == "single_premium":
            worker = self.premium
        elif self.kind == "random":
            worker = self.rng.choice(self.fleet)
        elif self.kind == "round_robin":
            worker = self.fleet[self._rr % len(self.fleet)]
            self._rr += 1
        else:  # pragma: no cover
            raise ValueError(self.kind)
        price = await quote(worker, job)
        # effective_bid mirrors price: no reputation weighting outside the market
        return Bid(job_id=job.id, agent_id=worker.id, price=price, effective_bid=price)
