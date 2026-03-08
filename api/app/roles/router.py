from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, require_csrf
from app.bu.deps import get_active_bu_optional
from app.db.session import get_db
from app.models.business_unit import BusinessUnit
from app.models.business_unit_user import BusinessUnitUser
from app.models.profile import Profile, ProfileKind
from app.models.profile_permission import ProfilePermission
from app.models.user import User
from app.rbac.deps import require_permission
from app.roles.schemas import RoleCreate, RoleOut, RolePermissionsOut, RolePermissionsUpdate, RoleUpdate

router = APIRouter(prefix="/api/roles", tags=["roles"])


SYSTEM_KEYS = {"admin_root", "ceo", "marketing", "comercial", "academico"}


def _slug(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"\s+", "-", value)
    value = re.sub(r"[^a-z0-9\-]+", "", value)
    value = re.sub(r"-{2,}", "-", value).strip("-")
    return value or "custom"


def _get_role_or_404(db: Session, role_id: str) -> Profile:
    r = db.execute(select(Profile).where(Profile.id == role_id)).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Perfil não encontrado")
    return r


def _require_active_bu(active_bu: BusinessUnit | None) -> BusinessUnit:
    if not active_bu:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="BU not selected")
    return active_bu


def _is_bu_admin_root(db: Session, user_id: str, bu_id: str) -> bool:
    stmt = select(BusinessUnit.admin_root_user_id).where(BusinessUnit.id == bu_id)
    admin_id = db.execute(stmt).scalar_one_or_none()
    return admin_id == user_id


def _can_manage_custom_roles(db: Session, me: User, bu_id: str) -> bool:
    return bool(me.is_root or _is_bu_admin_root(db, me.id, bu_id))


def _require_edit_rights(db: Session, me: User, bu_id: str, role: Profile) -> None:
    # System profiles can only be edited by global root
    if role.key in SYSTEM_KEYS and not me.is_root:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    # Custom profiles can be edited by root or BU Admin Root
    if role.kind == ProfileKind.CUSTOM.value and not _can_manage_custom_roles(db, me, bu_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


@router.get("", response_model=list[RoleOut], dependencies=[Depends(require_permission("settings", "roles", "read"))])
async def list_roles(
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
    active_bu: BusinessUnit | None = Depends(get_active_bu_optional),
) -> list[Profile]:
    roles: list[Profile] = []
    if me.is_root:
        roles.extend(list(db.execute(select(Profile).where(Profile.kind == ProfileKind.ROOT_GLOBAL.value)).scalars().all()))

    if active_bu:
        roles.extend(
            list(
                db.execute(
                    select(Profile).where(Profile.business_unit_id == active_bu.id).order_by(Profile.created_at.asc())
                ).scalars().all()
            )
        )
    return roles



@router.get("/{role_id}", response_model=RoleOut, dependencies=[Depends(require_permission("settings", "roles", "read"))])
async def get_role(
    role_id: str,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
    active_bu: BusinessUnit | None = Depends(get_active_bu_optional),
) -> Profile:
    bu = _require_active_bu(active_bu)
    role = _get_role_or_404(db, role_id)
    if role.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return role


@router.get("/{role_id}/permissions", response_model=RolePermissionsOut, dependencies=[Depends(require_permission("settings", "roles", "read"))])
async def get_role_permissions(
    role_id: str,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
    active_bu: BusinessUnit | None = Depends(get_active_bu_optional),
) -> RolePermissionsOut:
    bu = _require_active_bu(active_bu)
    role = _get_role_or_404(db, role_id)
    if role.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    rows = (
        db.execute(select(ProfilePermission).where(ProfilePermission.profile_id == role.id))
        .scalars()
        .all()
    )
    return RolePermissionsOut(
        permissions=[{"app": r.app, "resource": r.resource, "action": r.action} for r in rows]
    )


@router.post("", response_model=RoleOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_csrf), Depends(require_permission("settings", "roles", "create"))])
async def create_role(
    payload: RoleCreate,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
    active_bu: BusinessUnit | None = Depends(get_active_bu_optional),
) -> Profile:
    bu = _require_active_bu(active_bu)

    if not _can_manage_custom_roles(db, me, bu.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    key = _slug(payload.name)
    # Ensure uniqueness inside BU; if collides, suffix -2, -3...
    base_key = key
    i = 2
    while db.execute(select(Profile.id).where(Profile.business_unit_id == bu.id, Profile.key == key)).first():
        key = f"{base_key}-{i}"
        i += 1

    role = Profile(
        business_unit_id=bu.id,
        key=key,
        name=payload.name.strip(),
        kind=ProfileKind.CUSTOM.value,
        is_locked=False,
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    return role


@router.put("/{role_id}", response_model=RoleOut, dependencies=[Depends(require_csrf), Depends(require_permission("settings", "roles", "update"))])
async def update_role(
    role_id: str,
    payload: RoleUpdate,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
    active_bu: BusinessUnit | None = Depends(get_active_bu_optional),
) -> Profile:
    bu = _require_active_bu(active_bu)
    role = _get_role_or_404(db, role_id)

    if role.business_unit_id not in {None, bu.id}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    _require_edit_rights(db, me, bu.id, role)

    role.name = payload.name.strip()
    db.add(role)
    db.commit()
    db.refresh(role)
    return role


@router.put("/{role_id}/permissions", response_model=RoleOut, dependencies=[Depends(require_csrf), Depends(require_permission("settings", "roles", "update"))])
async def replace_role_permissions(
    role_id: str,
    payload: RolePermissionsUpdate,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
    active_bu: BusinessUnit | None = Depends(get_active_bu_optional),
) -> Profile:
    bu = _require_active_bu(active_bu)
    role = _get_role_or_404(db, role_id)

    if role.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    _require_edit_rights(db, me, bu.id, role)

    # Replace permissions
    db.query(ProfilePermission).filter(ProfilePermission.profile_id == role.id).delete(synchronize_session=False)
    for item in payload.permissions:
        db.add(ProfilePermission(profile_id=role.id, app=item.app.strip(), resource=item.resource.strip(), action=item.action.strip()))

    db.commit()
    db.refresh(role)
    return role


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response, response_model=None, dependencies=[Depends(require_csrf), Depends(require_permission("settings", "roles", "delete"))])
async def delete_role(
    role_id: str,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
    active_bu: BusinessUnit | None = Depends(get_active_bu_optional),
) -> Response:
    bu = _require_active_bu(active_bu)
    role = _get_role_or_404(db, role_id)

    if role.business_unit_id != bu.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    if role.is_locked or role.key in SYSTEM_KEYS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Perfil não pode ser deletado")

    if not _can_manage_custom_roles(db, me, bu.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    # Prevent deletion if someone uses it
    in_use = db.execute(select(BusinessUnitUser.id).where(BusinessUnitUser.business_unit_id == bu.id, BusinessUnitUser.profile_id == role.id).limit(1)).first()
    if in_use:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Perfil em uso")

    db.delete(role)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)