"""Bidding strategies — heterogeneity is what makes the market move.

Each strategy turns (estimated cost, last clearing price) into an asking
price. All randomness comes from the seeded RNG handed in by the sim, so
scenario runs are reproducible.
"""
import random

from canopy.config import settings
from canopy.jobs.schema import Job


class Strategy:
    name = "base"

    def __init__(self, rng: random.Random):
        self.rng = rng

    def price(self, job: Job, est_cost: float, last_clearing: float | None) -> float:
        raise NotImplementedError


class Undercutter(Strategy):
    """Bids just below the recent clearing price (cost-plus if no history)."""

    name = "undercutter"

    def price(self, job, est_cost, last_clearing):
        if last_clearing is not None:
            return max(est_cost, last_clearing * self.rng.uniform(0.85, 0.97))
        return est_cost * (1 + self.rng.uniform(0.05, 0.15))


class Premium(Strategy):
    """Prices high and leans on reputation to win anyway."""

    name = "premium"

    def price(self, job, est_cost, last_clearing):
        return est_cost * (1 + self.rng.uniform(0.5, 0.9))


class Generalist(Strategy):
    """Plain cost-plus with a margin drawn from the configured range."""

    name = "generalist"

    def price(self, job, est_cost, last_clearing):
        return est_cost * (1 + self.rng.uniform(settings.margin_min, settings.margin_max))


STRATEGIES: list[type[Strategy]] = [Undercutter, Premium, Generalist]
