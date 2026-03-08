from __future__ import annotations

import datetime as dt

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.object_id import new_id18
from app.models.base import Base


class PriceList(Base):
    """Lista de preços (pai)."""

    __tablename__ = "crm_price_lists"
    __table_args__ = (
        UniqueConstraint("business_unit_id", "name", name="uq_crm_price_lists_bu_name"),
    )

    id: Mapped[str] = mapped_column(String(18), primary_key=True, default=lambda: new_id18("PLS"))
    business_unit_id: Mapped[str] = mapped_column(
        String(18),
        ForeignKey("business_units.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"), index=True)

    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
