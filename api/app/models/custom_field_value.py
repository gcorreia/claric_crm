from __future__ import annotations

import datetime as dt

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.object_id import new_id18
from app.models.base import Base


class CustomFieldValue(Base):
    """Valores EAV tipados para campos customizados."""

    __tablename__ = "crm_custom_field_values"
    __table_args__ = (
        UniqueConstraint(
            "business_unit_id",
            "entity_type",
            "entity_id",
            "field_id",
            name="uq_cfval_one_value_per_field",
        ),
        Index("ix_cfval_lookup_text", "business_unit_id", "field_id", "value_text"),
        Index("ix_cfval_lookup_number", "business_unit_id", "field_id", "value_number"),
        Index("ix_cfval_lookup_date", "business_unit_id", "field_id", "value_date"),
    )

    id: Mapped[str] = mapped_column(String(18), primary_key=True, default=lambda: new_id18("CFV"))

    business_unit_id: Mapped[str] = mapped_column(
        String(18),
        ForeignKey("business_units.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    entity_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(18), nullable=False, index=True)

    field_id: Mapped[str] = mapped_column(
        String(18),
        ForeignKey("crm_custom_field_definitions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    value_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    value_number: Mapped[float | None] = mapped_column(Numeric(18, 6), nullable=True)
    value_bool: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    value_date: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
    value_ts: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    value_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
