# crm/api/app/tenants/apps_router.py
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import require_csrf, require_root_user
from app.db.session import get_db
from app.models.business_unit import BusinessUnit
from app.models.tenant_app import TenantApp
from app.models.user import User

AVAILABLE_APPS = [
    {"key": "crm", "label": "CRM"},
    {"key": "comercial", "label": "Comercial"},
    {"key": "academico", "label": "Acadêmico"},
    {"key": "financeiro", "label": "Financeiro"},
]


class AppOut(BaseModel):
    key: str
    label: str


class TenantAppOut(BaseModel):
    key: str
    label: str
    enabled: bool


class TenantAppsUpdateIn(BaseModel):
    apps: dict[str, bool] = Field(default_factory=dict)


router = APIRouter(prefix="/api/root", tags=["root/apps"])


def _ensure_tenant_exists(db: Session, tenant_id: str) -> BusinessUnit:
    bu = db.get(BusinessUnit, tenant_id)
    if not bu:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    return bu


@router.get("/apps", response_model=list[AppOut])
def list_available_apps(_: User = Depends(require_root_user)) -> list[AppOut]:
    return [AppOut(**a) for a in AVAILABLE_APPS]


@router.get("/tenants/{tenant_id}/apps", response_model=list[TenantAppOut])
def get_tenant_apps(
    tenant_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_root_user),
) -> list[TenantAppOut]:
    _ensure_tenant_exists(db, tenant_id)

    rows = db.execute(select(TenantApp).where(TenantApp.business_unit_id == tenant_id)).scalars().all()
    enabled_by_key = {r.app_key: bool(r.enabled) for r in rows}

    out: list[TenantAppOut] = []
    for a in AVAILABLE_APPS:
        out.append(
            TenantAppOut(
                key=a["key"],
                label=a["label"],
                enabled=enabled_by_key.get(a["key"], True),  # default enabled
            )
        )
    return out


@router.put(
    "/tenants/{tenant_id}/apps",
    response_model=list[TenantAppOut],
    dependencies=[Depends(require_csrf)],
)
def update_tenant_apps(
    tenant_id: str,
    payload: TenantAppsUpdateIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_root_user),
) -> list[TenantAppOut]:
    _ensure_tenant_exists(db, tenant_id)

    valid_keys = {a["key"] for a in AVAILABLE_APPS}
    unknown = sorted([k for k in payload.apps.keys() if k not in valid_keys])
    if unknown:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"unknown_apps": unknown})

    existing = db.execute(select(TenantApp).where(TenantApp.business_unit_id == tenant_id)).scalars().all()
    by_key = {r.app_key: r for r in existing}

    for key in valid_keys:
        if key not in payload.apps:
            continue  # safe: only change what is explicitly sent

        enabled = bool(payload.apps[key])
        row = by_key.get(key)
        if row:
            row.enabled = enabled
            db.add(row)
        else:
            db.add(TenantApp(business_unit_id=tenant_id, app_key=key, enabled=enabled))

    db.commit()
    return get_tenant_apps(tenant_id, db)