# crm/api/app/tenants/app_access.py
from __future__ import annotations

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.bu.deps import get_active_bu
from app.db.session import get_db
from app.models.business_unit import BusinessUnit
from app.models.tenant_app import TenantApp


def require_app_enabled(app_key: str):
    """
    Contract enforcement layer:
    - Root configures app enablement per tenant in `tenant_apps`.
    - For normal tenant requests, this dependency blocks access if the app is disabled
      for the currently selected BU (active_bu_id in session).

    Default policy:
    - If no row exists for (tenant, app_key) => enabled=True (fail-open).
      You can flip to fail-closed later if you want.
    """

    def _dep(
        bu: BusinessUnit = Depends(get_active_bu),
        db: Session = Depends(get_db),
    ) -> None:
        row = db.execute(
            select(TenantApp.enabled).where(
                TenantApp.business_unit_id == str(bu.id),
                TenantApp.app_key == app_key,
            )
        ).scalar_one_or_none()

        enabled = True if row is None else bool(row)

        if not enabled:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"App '{app_key}' desabilitado para este tenant",
            )

    return _dep