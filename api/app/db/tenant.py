# crm/api/app/db/tenant.py
from __future__ import annotations

from fastapi import Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.bu.deps import get_active_bu
from app.db.session import get_db
from app.models.business_unit import BusinessUnit


async def get_tenant_db(
    bu: BusinessUnit = Depends(get_active_bu),
    db: Session = Depends(get_db),
) -> Session:
    """
    Binds tenant context for RLS.
    Use session-level GUC so it survives commits within the same request.
    """
    db.execute(
        text("SELECT set_config('app.tenant_id', :tenant_id, false)"),
        {"tenant_id": str(bu.id)},
    )
    return db