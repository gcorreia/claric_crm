from __future__ import annotations

import datetime as dt

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.object_id import new_id18
from app.models.base import Base


class CustomObjectRecord(Base):
    """Registro de um objeto customizado.

    Campos customizados ficam em crm_custom_field_values (EAV tipado).
    """

    __tablename__ = "crm_custom_object_records"

    id: Mapped[str] = mapped_column(String(18), primary_key=True, default=lambda: new_id18("COR"))

    business_unit_id: Mapped[str] = mapped_column(
        String(18),
        ForeignKey("business_units.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    object_id: Mapped[str] = mapped_column(
        String(18),
        ForeignKey("crm_custom_object_definitions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False, default="")

    # Obrigatório quando o CustomObjectDefinition.parent_entity_type estiver definido.
    parent_id: Mapped[str | None] = mapped_column(String(18), nullable=True, index=True)

    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
