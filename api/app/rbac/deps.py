from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from sqlalchemy import and_, exists, or_, select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.bu.deps import get_active_bu_optional
from app.db.session import get_db
from app.models.business_unit import BusinessUnit
from app.models.business_unit_user import BusinessUnitUser
from app.models.profile import Profile, ProfileKind
from app.models.profile_permission import ProfilePermission
from app.models.user import User


@dataclass(frozen=True)
class Permission:
    app: str
    resource: str
    action: str


def _get_membership(db: Session, user_id: str, bu_id: str) -> BusinessUnitUser | None:
    stmt = select(BusinessUnitUser).where(
        BusinessUnitUser.user_id == user_id,
        BusinessUnitUser.business_unit_id == bu_id,
    )
    return db.execute(stmt).scalar_one_or_none()


def _get_profile_for_membership(db: Session, bu_id: str, membership: BusinessUnitUser) -> Profile | None:
    if membership.profile_id:
        return db.execute(select(Profile).where(Profile.id == membership.profile_id)).scalar_one_or_none()

    # fallback by legacy role
    key = "customizado"
    if membership.role == "BU_ADMIN_ROOT":
        key = "admin_root"
    stmt = select(Profile).where(Profile.business_unit_id == bu_id, Profile.key == key)
    return db.execute(stmt).scalar_one_or_none()


def _has_permission(db: Session, profile_id: str, perm: Permission) -> bool:
    # Exact or wildcard match. '*' can appear in any field.
    stmt = select(
        exists().where(
            and_(
                ProfilePermission.profile_id == profile_id,
                or_(ProfilePermission.app == perm.app, ProfilePermission.app == "*"),
                or_(ProfilePermission.resource == perm.resource, ProfilePermission.resource == "*"),
                or_(ProfilePermission.action == perm.action, ProfilePermission.action == "*"),
            )
        )
    )
    return bool(db.execute(stmt).scalar())


def require_permission(app: str, resource: str, action: str):
    perm = Permission(app=app, resource=resource, action=action)

    def _dep(
        db: Session = Depends(get_db),
        me: User = Depends(get_current_user),
        active_bu: BusinessUnit | None = Depends(get_active_bu_optional),
    ) -> None:
        if me.is_root:
            return

        if not active_bu:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="BU not selected")

        membership = _get_membership(db, me.id, active_bu.id)
        if not membership:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

        profile = _get_profile_for_membership(db, active_bu.id, membership)
        if not profile:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

        if profile.kind == ProfileKind.BU_ADMIN_ROOT.value:
            return

        if not _has_permission(db, profile.id, perm):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    return _dep
