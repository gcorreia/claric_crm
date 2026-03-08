from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, get_current_session, require_csrf
from app.auth.rate_limit import enforce_login_rate_limit
from app.auth.schemas import (
    BusinessUnitOut,
    CsrfResponse,
    LoginRequest,
    LoginResponse,
    MeResponse,
    UserOut,
)
from app.auth.security import verify_password
from app.auth.session_store import create_session, delete_session, rotate_csrf, set_active_bu, get_session
from app.core.config import settings
from app.core.redis import init_redis
from app.db.session import get_db
from app.models.user import User
from app.models.business_unit import BusinessUnit
from app.models.business_unit_user import BusinessUnitUser
from app.models.profile import Profile
from app.bu.access import list_accessible_business_units

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_session_cookie(response: Response, sid: str) -> None:
    response.set_cookie(
        key=settings.COOKIE_NAME,
        value=sid,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        domain=settings.COOKIE_DOMAIN,
        path="/",
        max_age=settings.SESSION_ABSOLUTE_SECONDS,  # align cookie lifetime with absolute TTL
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.COOKIE_NAME,
        domain=settings.COOKIE_DOMAIN,
        path="/",
    )


def _active_role_and_profile_key(db: Session, user_id: str, bu_id: str) -> tuple[str | None, str | None]:
    stmt = (
        select(BusinessUnitUser.role, Profile.key)
        .select_from(BusinessUnitUser)
        .join(Profile, Profile.id == BusinessUnitUser.profile_id, isouter=True)
        .where(BusinessUnitUser.user_id == user_id, BusinessUnitUser.business_unit_id == bu_id)
    )
    row = db.execute(stmt).first()
    if not row:
        return None, None
    role, profile_key = row
    return role, profile_key


def _list_business_units(db: Session, user: User) -> list[BusinessUnitOut]:
    bus = list_accessible_business_units(db, user)
    return [BusinessUnitOut(id=b.id, name=b.name, address=b.address) for b in bus]


def _resolve_active_bu(db: Session, active_bu_id: str | None) -> BusinessUnitOut | None:
    if active_bu_id is None:
        return None
    bu = db.get(BusinessUnit, active_bu_id)
    if not bu:
        return None
    return BusinessUnitOut(id=bu.id, name=bu.name, address=bu.address)


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)) -> LoginResponse:
    r = await init_redis()
    await enforce_login_rate_limit(r, request, payload.login)

    user: User | None = db.query(User).filter(User.email == payload.login).one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        # keep generic to reduce user enumeration
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User inactive")

    user.last_login_at = dt.datetime.now(dt.timezone.utc)
    db.add(user)
    db.commit()
    db.refresh(user)

    accessible = list_accessible_business_units(db, user)
    first_bu = accessible[0] if accessible else None
    if not first_bu:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No Business Units configured")

    sid, sess = await create_session(r, user.id, active_bu_id=first_bu.id)
    _set_session_cookie(response, sid)

    business_units = _list_business_units(db, user)
    active_bu = BusinessUnitOut(id=first_bu.id, name=first_bu.name, address=first_bu.address)
    active_bu_role, active_profile_key = _active_role_and_profile_key(db, user.id, first_bu.id)

    return LoginResponse(
        user=UserOut(id=user.id, email=user.email, name=user.name, is_active=user.is_active, is_root=user.is_root),
        csrf_token=sess.csrf_token,
        business_units=business_units,
        active_bu=active_bu,
        active_bu_role=active_bu_role,
        active_profile_key=active_profile_key,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def logout(request: Request, response: Response) -> Response:
    sid = request.cookies.get(settings.COOKIE_NAME)
    if sid:
        r = await init_redis()
        await delete_session(r, sid)

    _clear_session_cookie(response)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=MeResponse)
async def me(request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> MeResponse:
    r = await init_redis()
    sid = request.cookies.get(settings.COOKIE_NAME)
    sess = await get_session(r, sid) if sid else None
    active_bu = _resolve_active_bu(db, sess.active_bu_id if sess else None)

    business_units = _list_business_units(db, user)
    active_bu_role = None
    active_profile_key = None
    if active_bu:
        active_bu_role, active_profile_key = _active_role_and_profile_key(db, user.id, active_bu.id)

    return MeResponse(
        user=UserOut(id=user.id, email=user.email, name=user.name, is_active=user.is_active, is_root=user.is_root),
        business_units=business_units,
        active_bu=active_bu,
        active_bu_role=active_bu_role,
        active_profile_key=active_profile_key,
    )


@router.post("/csrf/rotate", response_model=CsrfResponse)
async def csrf_rotate(request: Request, _: str = Depends(require_csrf)) -> CsrfResponse:
    r = await init_redis()
    sid = request.cookies.get(settings.COOKIE_NAME)
    if not sid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    token = await rotate_csrf(r, sid)
    return CsrfResponse(csrf_token=token)


@router.post("/business-unit/active/{bu_id}", response_model=MeResponse)
async def set_active_business_unit(
    bu_id: str,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _: str = Depends(require_csrf),
) -> MeResponse:
    # authorization: must be accessible by this user
    accessible = list_accessible_business_units(db, user)
    if not any(b.id == bu_id for b in accessible):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to Business Unit")

    r = await init_redis()
    sid = request.cookies.get(settings.COOKIE_NAME)
    if not sid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    await set_active_bu(r, sid, bu_id)

    # reuse /me shape
    active_bu = _resolve_active_bu(db, bu_id)
    business_units = _list_business_units(db, user)
    active_bu_role, active_profile_key = _active_role_and_profile_key(db, user.id, bu_id)

    return MeResponse(
        user=UserOut(id=user.id, email=user.email, name=user.name, is_active=user.is_active, is_root=user.is_root),
        business_units=business_units,
        active_bu=active_bu,
        active_bu_role=active_bu_role,
        active_profile_key=active_profile_key,
    )