# crm/api/app/models/tenant_app.py
from __future__ import annotations

import datetime as dt

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class TenantApp(Base):
    """
    Per-tenant application enablement (contract layer).

    Security model:
    - Root manages contract (enable/disable per tenant) via root-only endpoints + CSRF.
    - App routers enforce contract for the active tenant (require_app_enabled).
    """
    __tablename__ = "tenant_apps"
    __table_args__ = (UniqueConstraint("business_unit_id", "app_key", name="uq_tenant_apps_bu_app"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    business_unit_id: Mapped[str] = mapped_column(String(18), ForeignKey("business_units.id"), nullable=False, index=True)
    app_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    business_unit = relationship("BusinessUnit", foreign_keys=[business_unit_id])