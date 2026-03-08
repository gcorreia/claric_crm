# crm/api/app/auth/csrf_router.py
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth.deps import get_current_session

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/csrf")
async def get_csrf_token(_: tuple[str, object] = Depends(get_current_session)) -> dict:
    """
    Returns the CSRF token for the current authenticated session.

    Security:
    - Requires a valid session cookie (same as /api/auth/me).
    - Does NOT require CSRF (read-only).
    """
    _, sess = _  # sess is SessionData
    return {"csrf_token": sess.csrf_token}