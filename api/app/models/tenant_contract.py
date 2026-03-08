from __future__ import annotations

import datetime as dt

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.id_mixin import HashedIdMixin


class TenantContract(Base, HashedIdMixin):
    __tablename__ = "tenant_contracts"
    __id_prefix__ = "TCT"

    tenant_id: Mapped[str] = mapped_column(String(18), ForeignKey("business_units.id"), nullable=False, unique=True)
    plan_id: Mapped[str] = mapped_column(String(18), ForeignKey("plans.id"), nullable=False)

    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant = relationship("BusinessUnit", foreign_keys=[tenant_id], lazy="joined")
    plan = relationship("Plan", foreign_keys=[plan_id], lazy="joined")

    __table_args__ = (UniqueConstraint("tenant_id", name="uq_tenant_contract_tenant_id"),)
