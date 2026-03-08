from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.auth.session_store import get_session, touch_session
from app.core.config import settings
from app.core.redis import init_redis
from app.db.session import get_db
from app.models.business_unit import BusinessUnit
from app.models.user import User
from app.bu.access import user_has_bu_access


async def get_active_bu(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> BusinessUnit:
    sid = request.cookies.get(settings.COOKIE_NAME)
    if not sid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    r = await init_redis()
    sess = await get_session(r, sid)
    if not sess:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    if sess.active_bu_id is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="BU not selected")

    bu = db.get(BusinessUnit, sess.active_bu_id)
    if not bu:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Active BU not found")

    if not user_has_bu_access(db, _, bu.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    await touch_session(r, sid)
    return bu


async def get_active_bu_optional(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> BusinessUnit | None:
    sid = request.cookies.get(settings.COOKIE_NAME)
    if not sid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    r = await init_redis()
    sess = await get_session(r, sid)
    if not sess:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    if sess.active_bu_id is None:
        await touch_session(r, sid)
        return None

    bu = db.get(BusinessUnit, sess.active_bu_id)
    if not bu:
        await touch_session(r, sid)
        return None

    if not user_has_bu_access(db, _, bu.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    await touch_session(r, sid)
    return bu
