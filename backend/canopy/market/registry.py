"""Agent registry — `agent:{id}` Hashes + the agents:leaderboard ZSET.

Phase 3 adds the RedisVL skill index for capability matching; Phase 1
just needs who exists, their wallet, reputation, and win/loss record.
"""
from canopy.config import settings
from canopy.market import events
from canopy.market.reputation import LEADERBOARD_KEY, NEUTRAL_REPUTATION
from canopy.redis_client import get_redis

AGENTS_SET = "agents:active"


async def register_agent(
    agent_id: str,
    name: str,
    model_tier: str,
    strategy: str,
    balance: float | None = None,
    parent_id: str = "",
    label: str = "",
) -> None:
    r = get_redis()
    pipe = r.pipeline()
    pipe.hset(
        f"agent:{agent_id}",
        mapping={
            "id": agent_id,
            "name": name,
            "label": label or agent_id,  # human-readable role description
            "model_tier": model_tier,
            "strategy": strategy,
            "balance": f"{balance if balance is not None else settings.starting_balance:.4f}",
            "reputation": f"{NEUTRAL_REPUTATION:.4f}",
            "jobs_won": 0,
            "jobs_failed": 0,
            "status": "active",
            "parent_id": parent_id,
        },
    )
    pipe.sadd(AGENTS_SET, agent_id)
    pipe.zadd(LEADERBOARD_KEY, {agent_id: NEUTRAL_REPUTATION})
    await pipe.execute()
    await events.emit(
        "agent_registered",
        {"agent_id": agent_id, "name": name, "model_tier": model_tier, "strategy": strategy},
    )


async def register_human(client_id: str = "human") -> None:
    """The human client gets a wallet but no leaderboard entry — it never bids."""
    r = get_redis()
    await r.hset(
        f"agent:{client_id}",
        mapping={"id": client_id, "name": client_id, "balance": f"{settings.human_balance:.4f}"},
    )


async def get_agent(agent_id: str) -> dict:
    r = get_redis()
    raw = await r.hgetall(f"agent:{agent_id}")
    if not raw:
        return {}
    for k in ("balance", "reputation"):
        if k in raw:
            raw[k] = float(raw[k])
    for k in ("jobs_won", "jobs_failed"):
        if k in raw:
            raw[k] = int(raw[k])
    return raw


async def active_agent_ids() -> list[str]:
    r = get_redis()
    return sorted(await r.smembers(AGENTS_SET))


async def get_reputation(agent_id: str) -> float:
    r = get_redis()
    raw = await r.hget(f"agent:{agent_id}", "reputation")
    return float(raw) if raw is not None else NEUTRAL_REPUTATION
