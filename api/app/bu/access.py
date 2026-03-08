# crm/api/app/bu/access.py
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.business_unit import BusinessUnit
from app.models.business_unit_user import BusinessUnitUser
from app.models.user import User


def user_has_bu_access(db: Session, user: User, business_unit_id: str) -> bool:
    """
    Returns True if:
      - user is root, or
      - user has a membership (business_unit_users) for the given BU.
    """
    if getattr(user, "is_root", False):
        return True

    stmt = (
        select(BusinessUnitUser.id)
        .where(BusinessUnitUser.user_id == user.id)
        .where(BusinessUnitUser.business_unit_id == business_unit_id)
        .limit(1)
    )
    return db.execute(stmt).first() is not None


def list_accessible_business_units(db: Session, user: User) -> list[BusinessUnit]:
    """
    Returns all BUs accessible to the user.
    Uses .unique() to avoid SQLAlchemy InvalidRequestError when models use joined eager loads.
    """
    if getattr(user, "is_root", False):
        stmt = select(BusinessUnit).order_by(BusinessUnit.id.asc())
        return list(db.execute(stmt).unique().scalars().all())

    stmt = (
        select(BusinessUnit)
        .join(BusinessUnitUser, BusinessUnitUser.business_unit_id == BusinessUnit.id)
        .where(BusinessUnitUser.user_id == user.id)
        .order_by(BusinessUnit.id.asc())
    )
    return list(db.execute(stmt).unique().scalars().all())