# crm/api/app/tenants/router.py
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import require_root_user
from app.db.session import get_db
from app.models.business_unit import BusinessUnit
from app.models.user import User

router = APIRouter(prefix="/api/root/tenants", tags=["root/tenants"])
legacy_router = APIRouter(prefix="/api/tenants", tags=["tenants"])


class TenantOut(BaseModel):
    id: str
    name: str
    address: str | None = None


class TenantUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    address: str | None = Field(default=None, max_length=500)


def _to_out(bu: BusinessUnit) -> TenantOut:
    return TenantOut(id=bu.id, name=bu.name, address=getattr(bu, "address", None))


def _list_tenants(db: Session) -> list[TenantOut]:
    bus = list(db.execute(select(BusinessUnit).order_by(BusinessUnit.id.asc())).unique().scalars().all())
    return [_to_out(b) for b in bus]


def _get_tenant(tenant_id: str, db: Session) -> TenantOut:
    bu = db.get(BusinessUnit, tenant_id)
    if not bu:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    return _to_out(bu)


def _update_tenant(tenant_id: str, payload: TenantUpdateIn, db: Session) -> TenantOut:
    bu = db.get(BusinessUnit, tenant_id)
    if not bu:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    if payload.name is not None:
        bu.name = payload.name
    if payload.address is not None:
        bu.address = payload.address

    db.commit()
    db.refresh(bu)
    return _to_out(bu)


@router.get("", response_model=list[TenantOut])
def list_tenants(db: Session = Depends(get_db), _: User = Depends(require_root_user)) -> list[TenantOut]:
    return _list_tenants(db)


@router.get("/{tenant_id}", response_model=TenantOut)
def get_tenant(tenant_id: str, db: Session = Depends(get_db), _: User = Depends(require_root_user)) -> TenantOut:
    return _get_tenant(tenant_id, db)


@router.put("/{tenant_id}", response_model=TenantOut)
def update_tenant(
    tenant_id: str,
    payload: TenantUpdateIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_root_user),
) -> TenantOut:
    return _update_tenant(tenant_id, payload, db)


@legacy_router.get("", response_model=list[TenantOut])
def legacy_list_tenants(db: Session = Depends(get_db), _: User = Depends(require_root_user)) -> list[TenantOut]:
    return _list_tenants(db)


@legacy_router.get("/{tenant_id}", response_model=TenantOut)
def legacy_get_tenant(
    tenant_id: str, db: Session = Depends(get_db), _: User = Depends(require_root_user)
) -> TenantOut:
    return _get_tenant(tenant_id, db)


@legacy_router.put("/{tenant_id}", response_model=TenantOut)
def legacy_update_tenant(
    tenant_id: str,
    payload: TenantUpdateIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_root_user),
) -> TenantOut:
    return _update_tenant(tenant_id, payload, db)