"""Async Redis connection factory (Redis Cloud in prod, local stack for dev)."""
import redis.asyncio as aredis

from canopy.config import settings

_pool: aredis.Redis | None = None


def get_redis() -> aredis.Redis:
    global _pool
    if _pool is None:
        _pool = aredis.from_url(settings.redis_url, decode_responses=True)
    return _pool
