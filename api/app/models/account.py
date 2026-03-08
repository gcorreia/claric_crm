# api/app/models/account.py

from __future__ import annotations

import datetime as dt

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.object_id import new_id18
from app.models.base import Base


class Account(Base):
    """Conta (Account) - entidade principal de CRM para empresas/organizações."""

    __tablename__ = "crm_accounts"

    id: Mapped[str] = mapped_column(String(18), primary_key=True, default=lambda: new_id18("ACC"))

    business_unit_id: Mapped[str] = mapped_column(
        String(18),
        ForeignKey("business_units.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)

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