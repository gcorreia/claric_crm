# crm/api/app/auth/deps.py
from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.redis import init_redis
from app.db.session import get_db
from app.models.user import User
from app.auth.session_store import get_session, touch_session, SessionData


async def _get_sid(request: Request) -> str:
    sid = request.cookies.get(settings.COOKIE_NAME)
    if not sid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return sid


async def get_current_session(request: Request) -> tuple[str, SessionData]:
    sid = await _get_sid(request)
    r = await init_redis()
    sess = await get_session(r, sid)
    if not sess:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")
    await touch_session(r, sid)
    return sid, sess


async def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    _, sess = await get_current_session(request)
    user = db.get(User, sess.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive")
    return user


async def require_root_user(user: User = Depends(get_current_user)) -> User:
    if not user.is_root:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Root only")
    return user


async def require_csrf(request: Request) -> str:
    sid, sess = await get_current_session(request)

    token = request.headers.get("X-CSRF-Token")
    if not token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing CSRF token")
    if token != sess.csrf_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token")

    return sid