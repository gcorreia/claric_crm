from __future__ import annotations

import datetime as dt

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.object_id import new_id18
from app.models.base import Base


class Quote(Base):
    """Cotacao comercial vinculada a uma oportunidade."""

    __tablename__ = "crm_quotes"

    id: Mapped[str] = mapped_column(String(18), primary_key=True, default=lambda: new_id18("QTE"))

    business_unit_id: Mapped[str] = mapped_column(
        String(18),
        ForeignKey("business_units.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    opportunity_id: Mapped[str] = mapped_column(
        String(18),
        ForeignKey("crm_opportunities.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    account_id: Mapped[str | None] = mapped_column(
        String(18),
        ForeignKey("crm_accounts.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="Draft", server_default="Draft")
    valid_until: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
    total_amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0, server_default="0")
    discount_amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0, server_default="0")
    final_amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0, server_default="0")

    owner_id: Mapped[str] = mapped_column(
        String(18),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    owner_name: Mapped[str | None] = mapped_column(String(200), nullable=True, default="")

    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
