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


def convergence_point(prices: list[float], band: float = 0.15) -> int | None:
    """First index from which every subsequent clearing price stays within
    ±band of the final settled level. None = too few points to judge."""
    if len(prices) < 2:
        return None
    final = prices[-1]
    lo, hi = final * (1 - band), final * (1 + band)
    for i in range(len(prices)):
        if all(lo <= p <= hi for p in prices[i:]):
            return i
    return len(prices) - 1  # only the final point is in-band → just converged


def convergence_summary(series: dict[str, list[float]], band: float = 0.15) -> dict:
    """Across all (category,hops) price series with >=2 settlements: the
    fraction that converged and the median jobs-to-convergence."""
    points = []
    for prices in series.values():
        if len(prices) >= 2:
            p = convergence_point(prices, band)
            if p is not None:
                points.append(p)
    if not points:
        return {"series": 0, "converged_pct": None, "median_jobs": None}
    points.sort()
    median = points[len(points) // 2]
    return {
        "series": len(points),
        "converged_pct": round(100 * sum(1 for p in points if p < len(points)) / len(points)),
        "median_jobs": median,
        "band_pct": int(band * 100),
    }
