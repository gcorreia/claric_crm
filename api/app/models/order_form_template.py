from __future__ import annotations

import datetime as dt

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.object_id import new_id18
from app.models.base import Base


class OrderFormTemplate(Base):
    __tablename__ = "crm_order_form_templates"
    __table_args__ = (
        UniqueConstraint("business_unit_id", name="uq_crm_order_form_templates_bu"),
    )

    id: Mapped[str] = mapped_column(String(18), primary_key=True, default=lambda: new_id18("OFT"))
    business_unit_id: Mapped[str] = mapped_column(
        String(18),
        ForeignKey("business_units.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    template_name: Mapped[str] = mapped_column(String(120), nullable=False, default="Template padrao")
    file_name_pattern: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        default="order-form-{opportunity_id}",
        server_default="order-form-{opportunity_id}",
    )
    locale: Mapped[str] = mapped_column(String(16), nullable=False, default="pt-BR", server_default="pt-BR")
    paper_size: Mapped[str] = mapped_column(String(16), nullable=False, default="A4", server_default="A4")
    orientation: Mapped[str] = mapped_column(String(16), nullable=False, default="portrait", server_default="portrait")
    primary_color: Mapped[str] = mapped_column(String(20), nullable=False, default="#166534", server_default="#166534")
    include_signature_block: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    header_text: Mapped[str] = mapped_column(String(500), nullable=False, default="", server_default="")
    footer_text: Mapped[str] = mapped_column(String(500), nullable=False, default="", server_default="")
    body_template: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    terms_template: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
