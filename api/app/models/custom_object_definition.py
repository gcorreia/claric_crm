from __future__ import annotations

import datetime as dt

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.object_id import new_id18
from app.models.base import Base


class CustomObjectDefinition(Base):
    """Metadata de um objeto customizado por BU (tenant).

    - key: slug imutável, único por BU.
    - parent_entity_type: quando definido, todo registro do objeto deve ter parent_id.
      Restrições de "core only" são aplicadas na API.
    """

    __tablename__ = "crm_custom_object_definitions"
    __table_args__ = (
        UniqueConstraint("business_unit_id", "key", name="uq_cobjdef_bu_key"),
    )

    id: Mapped[str] = mapped_column(String(18), primary_key=True, default=lambda: new_id18("COD"))

    business_unit_id: Mapped[str] = mapped_column(
        String(18),
        ForeignKey("business_units.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    key: Mapped[str] = mapped_column(String(64), nullable=False)  # slug imutável
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    plural_label: Mapped[str] = mapped_column(String(140), nullable=False, default="")

    parent_entity_type: Mapped[str | None] = mapped_column(String(50), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
