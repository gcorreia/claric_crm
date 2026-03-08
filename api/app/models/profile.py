from __future__ import annotations

import datetime as dt
from enum import StrEnum
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.object_id import new_id18
from app.models.base import Base


class ProfileKind(StrEnum):
    ROOT_GLOBAL = "ROOT_GLOBAL"
    BU_ADMIN_ROOT = "BU_ADMIN_ROOT"
    BU_SYSTEM = "BU_SYSTEM"
    CUSTOM = "CUSTOM"


class Profile(Base):
    __tablename__ = "profiles"
    __table_args__ = (
        UniqueConstraint("business_unit_id", "key", name="uq_profiles_bu_key"),
    )

    id: Mapped[str] = mapped_column(String(18), primary_key=True, default=lambda: new_id18("ROL"))
    business_unit_id: Mapped[Optional[str]] = mapped_column(String(18), ForeignKey("business_units.id"), nullable=True, index=True)

    key: Mapped[str] = mapped_column(String(60), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)

    kind: Mapped[str] = mapped_column(String(30), nullable=False, default=ProfileKind.CUSTOM.value)

    # Locked profiles cannot be deleted. System profiles are typically locked.
    is_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    business_unit: Mapped[Optional["BusinessUnit"]] = relationship("BusinessUnit")
    permissions: Mapped[list["ProfilePermission"]] = relationship(
        "ProfilePermission",
        back_populates="profile",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
