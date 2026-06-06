"""Agent base — the bidding economics shared by every market participant.

bid(): estimate cost (model-tier price), apply the strategy's margin,
clamp to [reserve_price, bounty_cap], divide by rep_weight(reputation)
→ effective bid. Each bid is a @weave.op so it shows up as a turn in
the job's thread. Execution lives in worker.py; subcontracting arrives
in Phase 3.
"""
import random

import weave

from canopy.agents.strategies import Generalist, Strategy
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

    @property
    def est_cost(self) -> float:
        return (
            settings.model_cost_premium
            if self.model_tier == "premium"
            else settings.model_cost_cheap
        )

    @weave.op
    async def bid(self, job: Job) -> Bid | None:
        """Price the job; returns None if the agent can't compete under the cap."""
        if self.est_cost > job.bounty_cap:
            return None  # can't even cover cost — sit this one out
        price = self.strategy.price(job, self.est_cost, await last_clearing_price(job.category))
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
