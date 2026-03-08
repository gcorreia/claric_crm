from __future__ import annotations

import datetime as dt

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.object_id import new_id18
from app.models.base import Base


class Lead(Base):
    """Lead - pessoa/empresa em prospecção."""

    __tablename__ = "crm_leads"

    id: Mapped[str] = mapped_column(String(18), primary_key=True, default=lambda: new_id18("LED"))

    business_unit_id: Mapped[str] = mapped_column(
        String(18),
        ForeignKey("business_units.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    account_id: Mapped[str] = mapped_column(
        String(18),
        ForeignKey("crm_accounts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    phone: Mapped[str] = mapped_column(String(60), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(60), nullable=False, default="Novo")
    source: Mapped[str] = mapped_column(String(60), nullable=False, default="")
    score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
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
