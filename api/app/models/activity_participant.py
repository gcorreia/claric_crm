from __future__ import annotations

import datetime as dt

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.object_id import new_id18
from app.models.base import Base


class ActivityParticipant(Base):
    """Participantes (contatos) vinculados a uma atividade."""

    __tablename__ = "crm_activity_participants"
    __table_args__ = (UniqueConstraint("activity_id", "contact_id", name="uq_crm_activity_participants_activity_contact"),)

    id: Mapped[str] = mapped_column(String(18), primary_key=True, default=lambda: new_id18("ATP"))

    business_unit_id: Mapped[str] = mapped_column(
        String(18),
        ForeignKey("business_units.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    activity_id: Mapped[str] = mapped_column(
        String(18),
        ForeignKey("crm_activities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    contact_id: Mapped[str] = mapped_column(
        String(18),
        ForeignKey("crm_contacts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
