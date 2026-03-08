from __future__ import annotations

import math
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.bu.deps import get_active_bu
from app.db.session import get_db
from app.models.account import Account
from app.models.business_unit import BusinessUnit
from app.models.contact import Contact
from app.models.lead import Lead
from app.models.opportunity import Opportunity
from app.models.plan import Plan
from app.models.tenant_contract import TenantContract

router = APIRouter(prefix="/api/limits", tags=["limits"], dependencies=[Depends(get_current_user)])


_OBJECT_MODEL = {
    "comercial.accounts": Account,
    "comercial.contacts": Contact,
    "comercial.leads": Lead,
    "comercial.opportunities": Opportunity,
}


class LimitCheckIn(BaseModel):
    object_key: Literal[
        "comercial.accounts",
        "comercial.contacts",
        "comercial.leads",
        "comercial.opportunities",
    ]
    delta: int = Field(default=0, ge=0)


class LimitCheckOut(BaseModel):
    status: Literal["OK", "WARN", "BLOCK"]
    limit: int | None = None
    current: int = 0
    after: int = 0
    hard_max: int | None = None
    overage_percent: int = 20


def _get_nested(d: dict[str, Any], path: list[str]) -> Any:
    cur: Any = d
    for k in path:
        if not isinstance(cur, dict) or k not in cur:
            return None
        cur = cur[k]
    return cur


def _get_plan_limits(db: Session, tenant_id: str) -> dict[str, Any]:
    c = db.scalar(select(TenantContract).where(TenantContract.tenant_id == tenant_id))
    if not c:
        return {}
    plan = db.get(Plan, c.plan_id)
    return plan.limits if plan and isinstance(plan.limits, dict) else {}


def _count(db: Session, bu_id: str, model: Any) -> int:
    return int(db.scalar(select(func.count()).select_from(model).where(model.business_unit_id == bu_id)) or 0)


def evaluate_limit(db: Session, tenant_id: str, object_key: str, delta: int) -> LimitCheckOut:
    limits = _get_plan_limits(db, tenant_id)
    overage_percent = int(_get_nested(limits, ["policy", "overage_percent"]) or 20)

    # map object_key -> limit path
    entity_key = object_key.split(".", 1)[1]  # accounts/contacts/leads/opportunities
    limit_val = _get_nested(limits, ["apps", "comercial", entity_key])
    try:
        limit_int = int(limit_val) if limit_val is not None else None
    except Exception:
        limit_int = None

    model = _OBJECT_MODEL.get(object_key)
    if not model:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Objeto inválido")

    current = _count(db, tenant_id, model)
    after = current + int(delta)

    if not limit_int or limit_int <= 0:
        return LimitCheckOut(status="OK", limit=None, current=current, after=after, hard_max=None, overage_percent=overage_percent)

    hard_max = int(math.ceil(limit_int * (1 + overage_percent / 100.0)))

    if after > hard_max:
        st = "BLOCK"
    elif after > limit_int:
        st = "WARN"
    else:
        st = "OK"

    return LimitCheckOut(status=st, limit=limit_int, current=current, after=after, hard_max=hard_max, overage_percent=overage_percent)


@router.post("/check", response_model=LimitCheckOut)
def check_limit(payload: LimitCheckIn, bu: BusinessUnit = Depends(get_active_bu), db: Session = Depends(get_db)) -> LimitCheckOut:
    return evaluate_limit(db, bu.id, payload.object_key, payload.delta)
