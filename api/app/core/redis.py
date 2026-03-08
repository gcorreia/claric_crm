from __future__ import annotations

from redis.asyncio import Redis

from app.core.config import settings

redis: Redis | None = None


async def init_redis() -> Redis:
    """
    Singleton async Redis client.

    Why: avoid creating new pools per request, reduce connection churn.
    """
    global redis
    if redis is None:
        redis = Redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            health_check_interval=30,
        )
    return redis


async def close_redis() -> None:
    global redis
    if redis is not None:
        await redis.close()
        redis = None