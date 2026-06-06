"""Reputation — the trust signal that discounts bids.

rep_weight() shapes the auction: effective_bid = price / rep_weight(rep),
so a high-rep agent can win with a slightly higher price.

update_reputation() is an EMA over job scores. In Phase 2 the score input
becomes the Weave referee Scorer's output — reputation MUST derive from
Weave scores; this module is just the arithmetic + storage.
"""
import weave

from canopy.config import settings
from canopy.market import events
from canopy.redis_client import get_redis

LEADERBOARD_KEY = "agents:leaderboard"
NEUTRAL_REPUTATION = 0.5


def rep_weight(reputation: float) -> float:
    """Multiplicative trust discount: neutral rep (0.5) → 1.0, rep 1.0 → 2x
    pricing power, collapsed rep → effective bids so high the market freezes
    the agent out (the credit-bureau death spiral, ~3 rejections deep)."""
    return max(0.1, (reputation / NEUTRAL_REPUTATION) ** settings.rep_weight_alpha)


@weave.op
async def update_reputation(agent_id: str, score: float) -> float:
    """EMA of job scores; mirrors into the agents:leaderboard ZSET."""
    r = get_redis()
    raw = await r.hget(f"agent:{agent_id}", "reputation")
    old = float(raw) if raw is not None else NEUTRAL_REPUTATION
    new = (1 - settings.reputation_beta) * old + settings.reputation_beta * score
    pipe = r.pipeline()
    pipe.hset(f"agent:{agent_id}", "reputation", f"{new:.4f}")
    pipe.zadd(LEADERBOARD_KEY, {agent_id: new})
    await pipe.execute()
    await events.emit(
        "reputation_update",
        {"agent_id": agent_id, "reputation": round(new, 4), "score": score},
    )
    return new
