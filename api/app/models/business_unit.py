from __future__ import annotations

import datetime as dt

from app.core.object_id import new_id18

from sqlalchemy import DateTime, String, func, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from app.models.user import User


class BusinessUnit(Base):
    __tablename__ = "business_units"

    id: Mapped[str] = mapped_column(String(18), primary_key=True, default=lambda: new_id18("BUS"))
    name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    address: Mapped[str] = mapped_column(String(500), nullable=False, default="")

    admin_root_user_id: Mapped[str | None] = mapped_column(String(18), ForeignKey("users.id"), nullable=True)
    admin_root_user: Mapped[Optional["User"]] = relationship("User", foreign_keys=[admin_root_user_id])

    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )