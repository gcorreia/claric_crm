from __future__ import annotations

import secrets
import time
from dataclasses import dataclass

from redis.asyncio import Redis

from app.core.config import settings


@dataclass(frozen=True)
class SessionData:
    user_id: str
    csrf_token: str
    created_at: int
    last_seen: int
    active_bu_id: str | None


def _key(session_id: str) -> str:
    return f"sess:{session_id}"


def new_session_id() -> str:
    return secrets.token_urlsafe(32)


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def _now() -> int:
    return int(time.time())


async def _load_raw(r: Redis, sid: str) -> dict[str, str] | None:
    raw = await r.hgetall(_key(sid))
    return raw or None


async def _is_abs_expired(raw: dict[str, str]) -> bool:
    try:
        created_at = int(raw["created_at"])
    except Exception:
        return True
    return (_now() - created_at) > settings.SESSION_ABSOLUTE_SECONDS


async def _delete_if_abs_expired(r: Redis, sid: str, raw: dict[str, str]) -> bool:
    if await _is_abs_expired(raw):
        await r.delete(_key(sid))
        return True
    return False


async def create_session(r: Redis, user_id: str, active_bu_id: str | None = None) -> tuple[str, SessionData]:
    now = _now()
    sid = new_session_id()
    data = SessionData(
        user_id=user_id,
        csrf_token=new_csrf_token(),
        created_at=now,
        last_seen=now,
        active_bu_id=active_bu_id,
    )
    await r.hset(
        _key(sid),
        mapping={
            "user_id": str(data.user_id),
            "csrf_token": data.csrf_token,
            "created_at": str(data.created_at),
            "last_seen": str(data.last_seen),
            "active_bu_id": "" if data.active_bu_id is None else str(data.active_bu_id),
        },
    )
    await r.expire(_key(sid), settings.SESSION_IDLE_SECONDS)
    return sid, data


async def get_session(r: Redis, sid: str) -> SessionData | None:
    raw = await _load_raw(r, sid)
    if not raw:
        return None

    if await _delete_if_abs_expired(r, sid, raw):
        return None

    try:
        active_raw = raw.get("active_bu_id", "")
        active_bu_id = str(active_raw) if str(active_raw).strip() else None

        return SessionData(
            user_id=str(raw["user_id"]),
            csrf_token=str(raw["csrf_token"]),
            created_at=int(raw["created_at"]),
            last_seen=int(raw.get("last_seen") or "0"),
            active_bu_id=active_bu_id,
        )
    except Exception:
        return None


async def touch_session(r: Redis, sid: str) -> None:
    raw = await _load_raw(r, sid)
    if not raw:
        return
    if await _delete_if_abs_expired(r, sid, raw):
        return

    now = _now()
    await r.hset(_key(sid), mapping={"last_seen": str(now)})
    await r.expire(_key(sid), settings.SESSION_IDLE_SECONDS)


async def rotate_csrf(r: Redis, sid: str) -> str:
    raw = await _load_raw(r, sid)
    if not raw:
        raise ValueError("Session not found")
    if await _delete_if_abs_expired(r, sid, raw):
        raise ValueError("Session expired")

    token = new_csrf_token()
    await r.hset(_key(sid), mapping={"csrf_token": token})
    await r.expire(_key(sid), settings.SESSION_IDLE_SECONDS)
    return token


async def set_active_bu(r: Redis, sid: str, bu_id: str) -> None:
    raw = await _load_raw(r, sid)
    if not raw:
        raise ValueError("Session not found")
    if await _delete_if_abs_expired(r, sid, raw):
        raise ValueError("Session expired")

    await r.hset(_key(sid), mapping={"active_bu_id": str(bu_id)})
    await r.expire(_key(sid), settings.SESSION_IDLE_SECONDS)


async def delete_session(r: Redis, sid: str) -> None:
    await r.delete(_key(sid))