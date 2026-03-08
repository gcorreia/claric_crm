from __future__ import annotations

import datetime as dt
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.object_id import new_id18
from app.models.base import Base


class ProductPriceList(Base):
    """Lista de preços por produto (1:N)."""

    __tablename__ = "crm_product_price_lists"
    __table_args__ = (
        UniqueConstraint("business_unit_id", "product_id", "name", name="uq_crm_product_price_lists_bu_product_name"),
    )

    id: Mapped[str] = mapped_column(String(18), primary_key=True, default=lambda: new_id18("PRL"))
    business_unit_id: Mapped[str] = mapped_column(
        String(18),
        ForeignKey("business_units.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    product_id: Mapped[str] = mapped_column(
        String(18),
        ForeignKey("crm_products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, server_default="0")
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="BRL", server_default="BRL")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"), index=True)

    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
