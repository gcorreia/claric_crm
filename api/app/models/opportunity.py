from __future__ import annotations

import datetime as dt

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.object_id import new_id18
from app.models.base import Base


class Opportunity(Base):
    """Oportunidade - negócio em andamento."""

    __tablename__ = "crm_opportunities"

    id: Mapped[str] = mapped_column(String(18), primary_key=True, default=lambda: new_id18("OPP"))

    business_unit_id: Mapped[str] = mapped_column(
        String(18),
        ForeignKey("business_units.id", ondelete="RESTRICT"),
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
    stage: Mapped[str] = mapped_column(String(60), nullable=False, default="Inicial")
    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, server_default="0")
    close_date: Mapped[dt.date] = mapped_column(Date, nullable=True)

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
