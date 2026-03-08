# crm/api/app/contracts/router.py
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, require_root_user
from app.bu.deps import get_active_bu_optional
from app.db.session import get_db
from app.models.business_unit import BusinessUnit
from app.models.plan import Plan, PlanScope
from app.models.tenant_contract import TenantContract
from app.models.user import User

router = APIRouter(prefix="/api/contracts", tags=["contracts"])


# -----------------------------
# Schemas
# -----------------------------
class PlanOut(BaseModel):
    id: str
    name: str
    scope: str
    tenant_id: str | None = None
    based_on_plan_id: str | None = None
    limits: dict[str, Any]


class ContractOut(BaseModel):
    tenant_id: str
    plan: PlanOut


class CreateTenantPlanIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    tenant_id: str
    based_on_plan_id: str | None = None
    limits: dict[str, Any] = Field(default_factory=dict)


class UpdatePlanIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    limits: dict[str, Any] | None = None


class ApplyPlanIn(BaseModel):
    tenant_id: str
    plan_id: str


# -----------------------------
# Helpers
# -----------------------------
def _plan_out(p: Plan) -> PlanOut:
    return PlanOut(
        id=p.id,
        name=p.name,
        scope=str(p.scope),
        tenant_id=p.tenant_id,
        based_on_plan_id=p.based_on_plan_id,
        limits=p.limits or {},
    )


def _get_global_plans(db: Session) -> list[Plan]:
    q = select(Plan).where(Plan.scope == PlanScope.GLOBAL).order_by(Plan.name.asc())
    return list(db.execute(q).unique().scalars().all())


def _get_default_global_plan(db: Session) -> Plan | None:
    basic = db.scalar(select(Plan).where(Plan.scope == PlanScope.GLOBAL, Plan.name == "Basic"))
    return basic or db.scalar(select(Plan).where(Plan.scope == PlanScope.GLOBAL).order_by(Plan.name.asc()))


def _get_tenant_contract(db: Session, tenant_id: str) -> TenantContract | None:
    return db.scalar(select(TenantContract).where(TenantContract.tenant_id == tenant_id))


def _ensure_contract(db: Session, tenant_id: str) -> TenantContract:
    contract = _get_tenant_contract(db, tenant_id)
    if contract:
        return contract

    default_plan = _get_default_global_plan(db)
    if not default_plan:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No GLOBAL plans available (seed may not have run).",
        )

    contract = TenantContract(tenant_id=tenant_id, plan_id=default_plan.id)
    db.add(contract)
    db.commit()
    db.refresh(contract)
    return contract


def _resolve_tenant_id(
    *,
    scope: Literal["GLOBAL", "TENANT"] | None,
    tenant_id: str | None,
    user: User,
    active_bu: BusinessUnit | None,
) -> str:
    """
    Resolve tenant_id com as regras:
      - se tenant_id veio: só root pode usar
      - senão: exige BU ativa
    """
    if tenant_id:
        if not user.is_root:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return tenant_id

    if not active_bu:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="BU not selected")

    return active_bu.id


# -----------------------------
# Routes
# -----------------------------
@router.get("/plans", response_model=list[PlanOut], dependencies=[Depends(get_current_user)])
def list_plans(
    scope: Literal["GLOBAL", "TENANT"] = Query("GLOBAL"),
    tenant_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    active_bu: BusinessUnit | None = Depends(get_active_bu_optional),
) -> list[PlanOut]:
    """
    GLOBAL: não depende de BU.
    TENANT:
      - se root e tenant_id fornecido => lista planos TENANT daquele tenant
      - senão => exige BU ativa e lista planos TENANT da BU ativa
    """
    if scope == "GLOBAL":
        return [_plan_out(p) for p in _get_global_plans(db)]

    resolved_tenant_id = _resolve_tenant_id(scope=scope, tenant_id=tenant_id, user=user, active_bu=active_bu)
    q = (
        select(Plan)
        .where(Plan.scope == PlanScope.TENANT)
        .where(Plan.tenant_id == resolved_tenant_id)
        .order_by(Plan.name.asc())
    )
    plans = list(db.execute(q).unique().scalars().all())
    return [_plan_out(p) for p in plans]


@router.get("/current", response_model=ContractOut, dependencies=[Depends(get_current_user)])
def get_current_contract(
    tenant_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    active_bu: BusinessUnit | None = Depends(get_active_bu_optional),
) -> ContractOut:
    """
    Retorna o contrato efetivo do tenant.
      - se root e tenant_id fornecido => usa tenant_id
      - senão => usa BU ativa
    """
    resolved_tenant_id = _resolve_tenant_id(scope=None, tenant_id=tenant_id, user=user, active_bu=active_bu)
    contract = _ensure_contract(db, resolved_tenant_id)

    plan = db.get(Plan, contract.plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Contract plan not found")

    return ContractOut(tenant_id=resolved_tenant_id, plan=_plan_out(plan))


@router.put("/apply", response_model=ContractOut)
def apply_plan_to_tenant(
    payload: ApplyPlanIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_root_user),
) -> ContractOut:
    """
    Root-only: aplica um plan_id ao tenant_id.
    """
    plan = db.get(Plan, payload.plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    if plan.scope == PlanScope.TENANT and plan.tenant_id != payload.tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="TENANT plan does not belong to tenant")

    contract = _get_tenant_contract(db, payload.tenant_id)
    if not contract:
        contract = TenantContract(tenant_id=payload.tenant_id, plan_id=payload.plan_id)
        db.add(contract)
    else:
        contract.plan_id = payload.plan_id

    db.commit()
    db.refresh(contract)
    return ContractOut(tenant_id=payload.tenant_id, plan=_plan_out(plan))


@router.post("/plans", response_model=PlanOut)
def create_tenant_plan(
    payload: CreateTenantPlanIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_root_user),
) -> PlanOut:
    """
    Root-only: cria plano custom (scope=TENANT) para um tenant.
    """
    if payload.based_on_plan_id:
        base = db.get(Plan, payload.based_on_plan_id)
        if not base:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Base plan not found")
        base_limits = base.limits or {}
    else:
        base_limits = {}

    merged_limits = {**base_limits, **(payload.limits or {})}

    plan = Plan(
        name=payload.name,
        scope=PlanScope.TENANT,
        tenant_id=payload.tenant_id,
        based_on_plan_id=payload.based_on_plan_id,
        limits=merged_limits,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return _plan_out(plan)


@router.put("/plans/{plan_id}", response_model=PlanOut)
def update_plan(
    plan_id: str,
    payload: UpdatePlanIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_root_user),
) -> PlanOut:
    """
    Root-only: edita um plano (GLOBAL ou TENANT).
    """
    plan = db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    if payload.name is not None:
        plan.name = payload.name

    if payload.limits is not None:
        plan.limits = payload.limits

    db.commit()
    db.refresh(plan)
    return _plan_out(plan)


PlanOut.model_rebuild()
ContractOut.model_rebuild()
CreateTenantPlanIn.model_rebuild()
UpdatePlanIn.model_rebuild()
ApplyPlanIn.model_rebuild()