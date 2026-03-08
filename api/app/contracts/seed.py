from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.business_unit import BusinessUnit
from app.models.plan import Plan, PlanScope
from app.models.tenant_contract import TenantContract


_DEFAULT_LIMITS = {
    "general": {"users": None, "email_sender_profiles": None},
    "apps": {
        "comercial": {
            "accounts": None,
            "contacts": None,
            "leads": None,
            "opportunities": None,
        }
    },
    "policy": {"overage_percent": 20},
}


def ensure_seed_plans(db: Session) -> None:
    stmt = select(Plan).where(Plan.scope == PlanScope.GLOBAL)
    existing = {p.name: p for p in db.execute(stmt).unique().scalars().all()}

    for name in ("Basic", "Silver", "Gold"):
        if name in existing:
            continue
        db.add(Plan(name=name, scope=PlanScope.GLOBAL, limits=_DEFAULT_LIMITS))

    db.commit()

    basic = db.scalar(select(Plan).where(Plan.scope == PlanScope.GLOBAL, Plan.name == "Basic"))
    if not basic:
        return

    bu_ids = list(db.scalars(select(BusinessUnit.id)).all())
    existing_contracts = {c for c in db.scalars(select(TenantContract.tenant_id)).all()}

    for bu_id in bu_ids:
        if bu_id in existing_contracts:
            continue
        db.add(TenantContract(tenant_id=bu_id, plan_id=basic.id))

    db.commit()