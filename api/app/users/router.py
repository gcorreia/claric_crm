from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, require_csrf
from app.auth.security import hash_password
from app.bu.deps import get_active_bu_optional
from app.db.session import get_db
from app.models.business_unit import BusinessUnit
from app.models.business_unit_user import BuRole, BusinessUnitUser
from app.models.profile import Profile
from app.models.user import User
from app.rbac.deps import require_permission
from app.users.schemas import UserCreate, UserOut, UserProfileOut, UserProfileUpdate, UserUpdate

router = APIRouter(prefix="/api/users", tags=["users"])


def _get_user_or_404(db: Session, user_id: str) -> User:
    u = db.execute(select(User).where(User.id == user_id)).scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")
    return u


def _ensure_active_bu(active_bu: BusinessUnit | None) -> BusinessUnit:
    if not active_bu:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="BU not selected")
    return active_bu


def _is_bu_admin_root_user(db: Session, user_id: str) -> bool:
    stmt = select(exists().where(BusinessUnit.admin_root_user_id == user_id))
    return bool(db.execute(stmt).scalar())


def _require_in_bu(db: Session, bu_id: str, user_id: str) -> None:
    stmt = select(BusinessUnitUser.id).where(
        BusinessUnitUser.business_unit_id == bu_id,
        BusinessUnitUser.user_id == user_id,
    )
    if db.execute(stmt).first() is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


def _is_admin_of_active_bu(db: Session, me: User, active_bu: BusinessUnit) -> bool:
    if me.is_root:
        return True
    stmt = select(BusinessUnitUser.role).where(
        BusinessUnitUser.business_unit_id == active_bu.id,
        BusinessUnitUser.user_id == me.id,
    )
    role = db.execute(stmt).scalar_one_or_none()
    return role == BuRole.BU_ADMIN_ROOT.value


def _user_out_row_to_schema(row) -> UserOut:
    user, pid, pkey, pname = row
    profile = None
    if pid and pkey and pname:
        profile = UserProfileOut(id=str(pid), key=str(pkey), name=str(pname))
    return UserOut(
        id=str(user.id),
        email=user.email,
        name=user.name,
        is_active=user.is_active,
        is_root=user.is_root,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
        updated_at=user.updated_at,
        profile=profile,
    )


def _root_user_out(me: User) -> UserOut:
    return UserOut(
        id=str(me.id),
        email=me.email,
        name=me.name,
        is_active=me.is_active,
        is_root=me.is_root,
        last_login_at=me.last_login_at,
        created_at=me.created_at,
        updated_at=me.updated_at,
        profile=UserProfileOut(id="root", key="root", name="root"),
    )


def _list_users_with_profile(db: Session, me: User, active_bu: BusinessUnit | None) -> list[UserOut]:
    """
    Anti-leak rule (backend enforced):
    - Root sees: only himself + users that belong to the active BU (if selected).
      If no active BU, root sees only himself.
    - Non-root sees: only users inside the active BU.
    """
    if me.is_root:
        # No active BU -> return only root
        if not active_bu:
            return [_root_user_out(me)]

        # Active BU -> return BU users + ensure root is included
        stmt = (
            select(User, Profile.id, Profile.key, Profile.name)
            .join(
                BusinessUnitUser,
                (BusinessUnitUser.user_id == User.id) & (BusinessUnitUser.business_unit_id == active_bu.id),
            )
            .outerjoin(Profile, Profile.id == BusinessUnitUser.profile_id)
            .order_by(User.id.desc())
        )
        users = [_user_out_row_to_schema(r) for r in db.execute(stmt).all()]

        if not any(u.id == str(me.id) for u in users):
            users.insert(0, _root_user_out(me))

        return users

    # Non-root: only active BU members
    active_bu = _ensure_active_bu(active_bu)
    stmt = (
        select(User, Profile.id, Profile.key, Profile.name)
        .join(
            BusinessUnitUser,
            (BusinessUnitUser.user_id == User.id) & (BusinessUnitUser.business_unit_id == active_bu.id),
        )
        .outerjoin(Profile, Profile.id == BusinessUnitUser.profile_id)
        .order_by(User.id.desc())
    )
    return [_user_out_row_to_schema(r) for r in db.execute(stmt).all()]


def _get_user_with_profile(db: Session, me: User, active_bu: BusinessUnit | None, user_id: str) -> UserOut:
    if me.is_root:
        if not active_bu:
            # Root without BU context: only allow fetching himself (anti-leak)
            if str(me.id) != user_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
            return _root_user_out(me)

        # Root with BU context: allow fetching only if user is in active BU OR is root himself
        if str(me.id) == user_id:
            return _root_user_out(me)

        stmt_check = select(BusinessUnitUser.id).where(
            BusinessUnitUser.business_unit_id == active_bu.id,
            BusinessUnitUser.user_id == user_id,
        )
        if db.execute(stmt_check).first() is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

        stmt = (
            select(User, Profile.id, Profile.key, Profile.name)
            .where(User.id == user_id)
            .join(
                BusinessUnitUser,
                (BusinessUnitUser.user_id == User.id) & (BusinessUnitUser.business_unit_id == active_bu.id),
            )
            .outerjoin(Profile, Profile.id == BusinessUnitUser.profile_id)
        )
        row = db.execute(stmt).first()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")
        return _user_out_row_to_schema(row)

    active_bu = _ensure_active_bu(active_bu)
    _require_in_bu(db, active_bu.id, user_id)
    stmt = (
        select(User, Profile.id, Profile.key, Profile.name)
        .where(User.id == user_id)
        .join(
            BusinessUnitUser,
            (BusinessUnitUser.user_id == User.id) & (BusinessUnitUser.business_unit_id == active_bu.id),
        )
        .outerjoin(Profile, Profile.id == BusinessUnitUser.profile_id)
    )
    row = db.execute(stmt).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")
    return _user_out_row_to_schema(row)


@router.get("", response_model=list[UserOut], dependencies=[Depends(require_permission("settings", "users", "read"))])
async def list_users(
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
    active_bu: BusinessUnit | None = Depends(get_active_bu_optional),
) -> list[UserOut]:
    return _list_users_with_profile(db, me, active_bu)


@router.get("/{user_id}", response_model=UserOut, dependencies=[Depends(require_permission("settings", "users", "read"))])
async def get_user(
    user_id: str,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
    active_bu: BusinessUnit | None = Depends(get_active_bu_optional),
) -> UserOut:
    return _get_user_with_profile(db, me, active_bu, user_id)


@router.post(
    "",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("settings", "users", "create"))],
)
async def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _csrf: str = Depends(require_csrf),
    me: User = Depends(get_current_user),
    active_bu: BusinessUnit | None = Depends(get_active_bu_optional),
) -> UserOut:
    active_bu = _ensure_active_bu(active_bu)

    email = payload.email.strip().lower()
    existing = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email já cadastrado")

    full_name = f"{payload.first_name.strip()} {payload.last_name.strip()}".strip() or None

    u = User(
        email=email,
        name=full_name,
        password_hash=hash_password(payload.password),
        is_active=bool(payload.is_active),
        is_root=False,
    )
    db.add(u)
    db.flush()

    ceo_profile_id = db.execute(
        select(Profile.id).where(Profile.business_unit_id == active_bu.id, Profile.key == "ceo")
    ).scalar_one_or_none()

    profile_id = payload.profile_id or ceo_profile_id

    if payload.profile_id and not _is_admin_of_active_bu(db, me, active_bu):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    db.add(
        BusinessUnitUser(
            business_unit_id=active_bu.id,
            user_id=u.id,
            role=BuRole.BU_MEMBER.value,
            profile_id=profile_id,
        )
    )

    db.commit()
    return _get_user_with_profile(db, me, active_bu, str(u.id))


@router.put(
    "/{user_id}",
    response_model=UserOut,
    dependencies=[Depends(require_permission("settings", "users", "update"))],
)
async def update_user(
    user_id: str,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    _csrf: str = Depends(require_csrf),
    me: User = Depends(get_current_user),
    active_bu: BusinessUnit | None = Depends(get_active_bu_optional),
) -> UserOut:
    u = _get_user_or_404(db, user_id)
    active_bu = _ensure_active_bu(active_bu) if not me.is_root else active_bu

    if not me.is_root:
        _require_in_bu(db, active_bu.id, user_id)
        if _is_bu_admin_root_user(db, user_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    full_name = f"{payload.first_name.strip()} {payload.last_name.strip()}".strip() or None
    u.name = full_name
    u.is_active = bool(payload.is_active)

    if payload.password:
        u.password_hash = hash_password(payload.password)

    db.add(u)
    db.commit()

    return _get_user_with_profile(db, me, active_bu, user_id)


@router.patch(
    "/{user_id}/profile",
    response_model=UserOut,
    dependencies=[Depends(require_permission("settings", "users", "update"))],
)
async def update_user_profile(
    user_id: str,
    payload: UserProfileUpdate,
    db: Session = Depends(get_db),
    _csrf: str = Depends(require_csrf),
    me: User = Depends(get_current_user),
    active_bu: BusinessUnit | None = Depends(get_active_bu_optional),
) -> UserOut:
    active_bu = _ensure_active_bu(active_bu)

    if not _is_admin_of_active_bu(db, me, active_bu):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    if _is_bu_admin_root_user(db, user_id) and not me.is_root:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    _require_in_bu(db, active_bu.id, user_id)

    prof = db.execute(
        select(Profile).where(Profile.id == payload.profile_id, Profile.business_unit_id == active_bu.id)
    ).scalar_one_or_none()
    if not prof:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Perfil não encontrado")

    membership = db.execute(
        select(BusinessUnitUser).where(
            BusinessUnitUser.business_unit_id == active_bu.id,
            BusinessUnitUser.user_id == user_id,
        )
    ).scalar_one()

    membership.profile_id = prof.id
    db.add(membership)
    db.commit()

    return _get_user_with_profile(db, me, active_bu, user_id)


@router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
    dependencies=[Depends(require_permission("settings", "users", "delete"))],
)
async def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    _csrf: str = Depends(require_csrf),
    me: User = Depends(get_current_user),
    active_bu: BusinessUnit | None = Depends(get_active_bu_optional),
) -> Response:
    active_bu = _ensure_active_bu(active_bu) if not me.is_root else active_bu

    if not me.is_root:
        _require_in_bu(db, active_bu.id, user_id)
        if _is_bu_admin_root_user(db, user_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    if _is_bu_admin_root_user(db, user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    u = _get_user_or_404(db, user_id)
    db.delete(u)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
