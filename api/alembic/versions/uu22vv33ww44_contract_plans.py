"""contract plans and tenant contracts

Revision ID: uu22vv33ww44
Revises: tt11uu22vv33
Create Date: 2026-02-22

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "uu22vv33ww44"
down_revision = "tt11uu22vv33"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plans",
        sa.Column("id", sa.String(length=18), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("scope", sa.String(length=20), nullable=False, server_default="GLOBAL"),
        sa.Column("tenant_id", sa.String(length=18), sa.ForeignKey("business_units.id"), nullable=True),
        sa.Column("based_on_plan_id", sa.String(length=18), sa.ForeignKey("plans.id"), nullable=True),
        sa.Column("limits", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_plans_scope", "plans", ["scope"])
    op.create_index("ix_plans_tenant_id", "plans", ["tenant_id"])

    op.create_table(
        "tenant_contracts",
        sa.Column("id", sa.String(length=18), primary_key=True, nullable=False),
        sa.Column("tenant_id", sa.String(length=18), sa.ForeignKey("business_units.id"), nullable=False),
        sa.Column("plan_id", sa.String(length=18), sa.ForeignKey("plans.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", name="uq_tenant_contract_tenant_id"),
    )
    op.create_index("ix_tenant_contracts_plan_id", "tenant_contracts", ["plan_id"])


def downgrade() -> None:
    op.drop_index("ix_tenant_contracts_plan_id", table_name="tenant_contracts")
    op.drop_table("tenant_contracts")
    op.drop_index("ix_plans_tenant_id", table_name="plans")
    op.drop_index("ix_plans_scope", table_name="plans")
    op.drop_table("plans")
