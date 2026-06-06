"""Descriptive market statistics (evaluation_plan.md §4).

These show the mechanism doing something no fixed pipeline can do at all —
a fixed pipeline has no price to converge and no specialists to emerge.
"""
from collections import defaultdict

from canopy.jobs.schema import JobStatus


def specialization_index(job_log) -> dict[str, float]:
    """Per category: share of settled jobs won by that category's top agent."""
    wins: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for job, _ in job_log:
        if job.status == JobStatus.SETTLED and job.winner_id and not job.parent_job_id:
            wins[job.category][job.winner_id] += 1
    return {
        cat: max(by_agent.values()) / sum(by_agent.values())
        for cat, by_agent in wins.items()
        if sum(by_agent.values()) > 0
    }


def convergence_point(prices: list[float], band: float = 0.10) -> int | None:
    """First index from which every subsequent clearing price stays within
    ±band of the final settled level. None = never converged."""
    if len(prices) < 3:
        return None
    final = prices[-1]
    lo, hi = final * (1 - band), final * (1 + band)
    for i in range(len(prices)):
        if all(lo <= p <= hi for p in prices[i:]):
            return i
    return None
