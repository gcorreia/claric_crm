from __future__ import annotations

import datetime as dt
from enum import Enum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.object_id import new_id18
from app.models.base import Base


class CustomFieldType(str, Enum):
    text = "text"
    textarea = "textarea"
    number = "number"
    boolean = "boolean"
    date = "date"
    datetime = "datetime"
    single_select = "single_select"
    multi_select = "multi_select"
    email = "email"
    phone = "phone"
    url = "url"


class CustomFieldDefinition(Base):
    """Metadata de um campo customizável por BU (tenant) para Core OU Custom Object."""

    __tablename__ = "crm_custom_field_definitions"
    __table_args__ = (
        # ✅ Exatamente 1 alvo: core (entity_type) XOR custom (custom_object_id)
        CheckConstraint(
            "(entity_type IS NOT NULL AND custom_object_id IS NULL) OR "
            "(entity_type IS NULL AND custom_object_id IS NOT NULL)",
            name="ck_cfdef_target_xor",
        ),
        # ✅ Unicidade por BU + entity_type (apenas core)
        Index(
            "uq_cfdef_bu_core_key",
            "business_unit_id",
            "entity_type",
            "key",
            unique=True,
            postgresql_where="custom_object_id IS NULL",
        ),
        # ✅ Unicidade por BU + custom_object_id (apenas custom objects)
        Index(
            "uq_cfdef_bu_customobj_key",
            "business_unit_id",
            "custom_object_id",
            "key",
            unique=True,
            postgresql_where="custom_object_id IS NOT NULL",
        ),
    )

    id: Mapped[str] = mapped_column(String(18), primary_key=True, default=lambda: new_id18("CFD"))

    business_unit_id: Mapped[str] = mapped_column(
        String(18),
        ForeignKey("business_units.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # Core target (ex: 'account') — nullable porque para custom object será NULL
    entity_type: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)

    # Custom object target — nullable porque para core será NULL
    custom_object_id: Mapped[str | None] = mapped_column(
        String(18),
        ForeignKey("crm_custom_object_definitions.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    

    session_id: Mapped[str] = mapped_column(
        String(18),
        ForeignKey("crm_custom_field_sessions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    key: Mapped[str] = mapped_column(String(64), nullable=False)  # slug imutável
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    type: Mapped[str] = mapped_column(String(30), nullable=False)

    required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    options: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    validations: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    default_value: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
