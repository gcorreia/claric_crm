from __future__ import annotations

import datetime as dt

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.object_id import new_id18
from app.models.base import Base


class CustomFieldSession(Base):
    """Sessão (section) que agrupa campos customizáveis por BU (tenant) para Core OU Custom Object.

    Regras:
      - Exatamente 1 alvo: core (entity_type) XOR custom (custom_object_id)
      - Toda definição de campo deve pertencer a 1 sessão
    """

    __tablename__ = "crm_custom_field_sessions"
    __table_args__ = (
        CheckConstraint(
            "(entity_type IS NOT NULL AND custom_object_id IS NULL) OR "
            "(entity_type IS NULL AND custom_object_id IS NOT NULL)",
            name="ck_cfs_target_xor",
        ),
        CheckConstraint(
            "layout_columns IN (2, 3)",
            name="ck_cfs_layout_columns",
        ),
        Index(
            "uq_cfs_bu_core_key",
            "business_unit_id",
            "entity_type",
            "key",
            unique=True,
            postgresql_where="custom_object_id IS NULL",
        ),
        Index(
            "uq_cfs_bu_customobj_key",
            "business_unit_id",
            "custom_object_id",
            "key",
            unique=True,
            postgresql_where="custom_object_id IS NOT NULL",
        ),
    )

    id: Mapped[str] = mapped_column(String(18), primary_key=True, default=lambda: new_id18("CFS"))

    business_unit_id: Mapped[str] = mapped_column(
        String(18),
        ForeignKey("business_units.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    entity_type: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    custom_object_id: Mapped[str | None] = mapped_column(
        String(18),
        ForeignKey("crm_custom_object_definitions.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    key: Mapped[str] = mapped_column(String(64), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    layout_columns: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
