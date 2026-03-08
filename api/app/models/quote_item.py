from __future__ import annotations

import datetime as dt

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.object_id import new_id18
from app.models.base import Base


class QuoteItem(Base):
    """Item de cotacao comercial."""

    __tablename__ = "crm_quote_items"

    id: Mapped[str] = mapped_column(String(18), primary_key=True, default=lambda: new_id18("QIT"))

    business_unit_id: Mapped[str] = mapped_column(
        String(18),
        ForeignKey("business_units.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    quote_id: Mapped[str] = mapped_column(
        String(18),
        ForeignKey("crm_quotes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    product_id: Mapped[str | None] = mapped_column(
        String(18),
        ForeignKey("crm_products.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    description: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    quantity: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False, default=1, server_default="1")
    unit_price: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0, server_default="0")
    discount_percent: Mapped[float] = mapped_column(Numeric(7, 4), nullable=False, default=0, server_default="0")
    discount_amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0, server_default="0")
    line_total: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0, server_default="0")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
