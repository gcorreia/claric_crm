from __future__ import annotations

import time
from dataclasses import dataclass

from fastapi import HTTPException, Request, status
from redis.asyncio import Redis

from app.core.config import settings


@dataclass(frozen=True)
class RateLimitResult:
    allowed: bool
    remaining: int
    reset_in_seconds: int


def _client_ip(request: Request) -> str:
    # Why: in real deployments, trust X-Forwarded-For only if your proxy overwrites it.
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def _key(ip: str, login: str) -> str:
    return f"rl:login:{ip}:{login.lower().strip()}"


async def enforce_login_rate_limit(r: Redis, request: Request, login: str) -> RateLimitResult:
    ip = _client_ip(request)
    key = _key(ip, login)

    count = await r.incr(key)
    if count == 1:
        await r.expire(key, settings.LOGIN_RL_WINDOW_SECONDS)

    ttl = await r.ttl(key)
    ttl = int(ttl) if ttl is not None and ttl >= 0 else settings.LOGIN_RL_WINDOW_SECONDS

    remaining = max(settings.LOGIN_RL_MAX_ATTEMPTS - int(count), 0)
    allowed = int(count) <= settings.LOGIN_RL_MAX_ATTEMPTS

    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Try again later.",
            headers={"Retry-After": str(ttl)},
        )

    return RateLimitResult(allowed=True, remaining=remaining, reset_in_seconds=ttl)