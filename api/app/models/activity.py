from __future__ import annotations

import datetime as dt

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.object_id import new_id18
from app.models.base import Base


class Activity(Base):
    """Atividade (fase 1: task) vinculada a registros CRM."""

    __tablename__ = "crm_activities"

    id: Mapped[str] = mapped_column(String(18), primary_key=True, default=lambda: new_id18("ATV"))

    business_unit_id: Mapped[str] = mapped_column(
        String(18),
        ForeignKey("business_units.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    type: Mapped[str] = mapped_column(String(20), nullable=False, default="task", server_default="task")
    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="Open", server_default="Open")
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="Normal", server_default="Normal")

    due_date: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
    start_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    what_type: Mapped[str | None] = mapped_column(String(30), nullable=True, index=True)
    what_id: Mapped[str | None] = mapped_column(String(18), nullable=True, index=True)
    who_type: Mapped[str | None] = mapped_column(String(30), nullable=True, index=True)
    who_id: Mapped[str | None] = mapped_column(String(18), nullable=True, index=True)

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
