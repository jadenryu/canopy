"""Agent base — the bidding economics shared by every market participant.

Cost model: a solo agent must grind every hop itself, so est_cost =
model_cost * hops. A manager prices on cheap subcontract labor instead
(hops * cheap_cost * discount) — that spread is its business model.

bid(): estimate cost, apply the strategy's margin (strategies may decline),
clamp to [reserve_price, bounty_cap], divide by rep_weight(reputation)
→ effective bid. Each bid is a @weave.op so it shows up as a turn in
the job's thread. Execution lives in worker.py.
"""
import random

import weave

from canopy.agents.strategies import Generalist, Manager, Strategy
from canopy.config import settings
from canopy.jobs.schema import Bid, Job, JobResult
from canopy.market import registry
from canopy.market.reputation import rep_weight
from canopy.market.settlement import last_clearing_price


class Agent:
    def __init__(
        self,
        agent_id: str,
        strategy: Strategy | None = None,
        model_tier: str = "cheap",
        rng: random.Random | None = None,
    ):
        self.id = agent_id
        self.strategy = strategy or Generalist(rng or random.Random(settings.rng_seed))
        self.model_tier = model_tier
        self.busy_jobs = 0  # concurrent executions → surge pricing while > 0

    @property
    def is_manager(self) -> bool:
        return isinstance(self.strategy, Manager)

    @property
    def busy(self) -> bool:
        return self.busy_jobs > 0

    def est_cost(self, job: Job) -> float:
        if self.is_manager:
            # decompose + hire cheap labor per hop, skim the spread
            return job.hops * settings.model_cost_cheap * settings.manager_hop_discount
        per_hop = settings.model_costs.get(
            getattr(self, "model", ""),
            settings.model_cost_premium
            if self.model_tier == "premium"
            else settings.model_cost_cheap,
        )
        return job.hops * per_hop

    @weave.op
    async def bid(self, job: Job) -> Bid | None:
        """Price the job; None = decline (out of niche, or can't compete)."""
        est = self.est_cost(job)
        if est > job.bounty_cap:
            return None  # can't even cover cost — sit this one out
        price = self.strategy.price(
            job, est, await last_clearing_price(job.category, job.hops)
        )
        if price is None:
            return None
        if self.busy:  # property: busy_jobs > 0
            # capacity is priced, not blocked: a loaded agent quotes overtime.
            # this is what makes demand spikes visibly move the market.
            price *= settings.busy_surge
        if settings.lessons_enabled:
            # self-improvement, deterministic channel: a rough patch of
            # referee scores makes the agent price more humbly
            from canopy.agents.lessons import recent_mean_score

            mean = await recent_mean_score(self.id)
            if mean is not None:
                price *= 0.85 + 0.15 * mean
        price = min(max(price, settings.reserve_price), job.bounty_cap)
        reputation = await registry.get_reputation(self.id)
        return Bid(
            job_id=job.id,
            agent_id=self.id,
            price=price,
            effective_bid=price / rep_weight(reputation),
        )

    async def execute_job(self, job: Job) -> JobResult:
        raise NotImplementedError
