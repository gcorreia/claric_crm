from __future__ import annotations

import datetime as dt

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.object_id import new_id18
from app.models.base import Base


class DashboardDefinition(Base):
    """Definição de dashboard salvo por BU (tenant)."""

    __tablename__ = "crm_dashboard_definitions"

    id: Mapped[str] = mapped_column(String(18), primary_key=True, default=lambda: new_id18("DSH"))

    business_unit_id: Mapped[str] = mapped_column(
        String(18),
        ForeignKey("business_units.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    folder: Mapped[str] = mapped_column(String(20), nullable=False, default="private", server_default="private", index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    layout: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")

    owner_id: Mapped[str | None] = mapped_column(
        String(18),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
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
