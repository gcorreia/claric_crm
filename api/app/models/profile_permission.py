from __future__ import annotations

import datetime as dt

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.object_id import new_id18
from app.models.base import Base


class ProfilePermission(Base):
    __tablename__ = "profile_permissions"
    __table_args__ = (
        UniqueConstraint("profile_id", "app", "resource", "action", name="uq_profile_permissions_profile_app_resource_action"),
    )

    id: Mapped[str] = mapped_column(String(18), primary_key=True, default=lambda: new_id18("RLP"))
    profile_id: Mapped[str] = mapped_column(String(18), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)

    # Use '*' to mean "any".
    app: Mapped[str] = mapped_column(String(60), nullable=False)
    resource: Mapped[str] = mapped_column(String(60), nullable=False)
    action: Mapped[str] = mapped_column(String(20), nullable=False)

    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    profile: Mapped["Profile"] = relationship("Profile", back_populates="permissions")
