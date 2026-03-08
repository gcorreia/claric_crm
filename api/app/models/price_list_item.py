from __future__ import annotations

import datetime as dt
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.object_id import new_id18
from app.models.base import Base


class PriceListItem(Base):
    """Produtos e preços de uma lista de preços (filho)."""

    __tablename__ = "crm_price_list_items"
    __table_args__ = (
        UniqueConstraint("business_unit_id", "price_list_id", "product_id", name="uq_crm_price_list_items_bu_list_product"),
    )

    id: Mapped[str] = mapped_column(String(18), primary_key=True, default=lambda: new_id18("PLI"))
    business_unit_id: Mapped[str] = mapped_column(
        String(18),
        ForeignKey("business_units.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    price_list_id: Mapped[str] = mapped_column(
        String(18),
        ForeignKey("crm_price_lists.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_id: Mapped[str] = mapped_column(
        String(18),
        ForeignKey("crm_products.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, server_default="0")
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="BRL", server_default="BRL")

    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
