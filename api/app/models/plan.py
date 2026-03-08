from __future__ import annotations

import datetime as dt
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.id_mixin import HashedIdMixin


class PlanScope:
    GLOBAL = "GLOBAL"
    TENANT = "TENANT"


class Plan(Base, HashedIdMixin):
    """Plan template or tenant-scoped custom plan.

    limits schema (JSONB):
      {
        "general": {"users": int|null, "email_sender_profiles": int|null},
        "apps": {"comercial": {"accounts": int|null, "contacts": int|null, "leads": int|null, "opportunities": int|null}}
      }
    """

    __tablename__ = "plans"
    __id_prefix__ = "PLN"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    scope: Mapped[str] = mapped_column(String(20), nullable=False, default=PlanScope.GLOBAL)

    tenant_id: Mapped[str | None] = mapped_column(String(18), ForeignKey("business_units.id"), nullable=True)
    based_on_plan_id: Mapped[str | None] = mapped_column(String(18), ForeignKey("plans.id"), nullable=True)

    limits: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant = relationship("BusinessUnit", foreign_keys=[tenant_id], lazy="joined")
    based_on = relationship("Plan", foreign_keys=[based_on_plan_id], lazy="joined")
