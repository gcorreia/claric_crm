from __future__ import annotations

import datetime as dt

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.object_id import new_id18
from app.models.base import Base


class Contact(Base):
    """Contato - pessoa vinculada a uma Conta (B2B puro).

    Core físico mínimo:
    - account_id (obrigatório)
    - name
    - external_id (ID do contato no domínio de negócio)
    - contact_role
    - owner_id
    - owner_name
    """

    __tablename__ = "crm_contacts"
    __table_args__ = (
        UniqueConstraint("business_unit_id", "external_id", name="uq_crm_contacts_bu_external_id"),
    )

    id: Mapped[str] = mapped_column(String(18), primary_key=True, default=lambda: new_id18("CON"))

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
    external_id: Mapped[str] = mapped_column(String(32), nullable=False)
    contact_role: Mapped[str] = mapped_column(String(60), nullable=False)

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
