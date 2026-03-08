from __future__ import annotations

from typing import Optional

import datetime as dt
from enum import StrEnum

from app.core.object_id import new_id18

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class BuRole(StrEnum):
    BU_ADMIN_ROOT = "BU_ADMIN_ROOT"
    BU_ADMIN = "BU_ADMIN"
    BU_MEMBER = "BU_MEMBER"


class BusinessUnitUser(Base):
    __tablename__ = "business_unit_users"
    __table_args__ = (
        UniqueConstraint("business_unit_id", "user_id", name="uq_business_unit_users_bu_user"),
    )

    id: Mapped[str] = mapped_column(String(18), primary_key=True, default=lambda: new_id18("BUL"))
    business_unit_id: Mapped[str] = mapped_column(String(18), ForeignKey("business_units.id"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(18), ForeignKey("users.id"), nullable=False, index=True)
    profile_id: Mapped[Optional[str]] = mapped_column(String(18), ForeignKey("profiles.id"), nullable=True, index=True)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default=BuRole.BU_MEMBER.value)

    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    business_unit: Mapped["BusinessUnit"] = relationship("BusinessUnit")
    user: Mapped["User"] = relationship("User")
    profile: Mapped[Optional["Profile"]] = relationship("Profile")
