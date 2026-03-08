# crm/api/app/roles/seed.py
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.business_unit import BusinessUnit
from app.models.profile import Profile, ProfileKind


def ensure_seed_profiles(db: Session) -> None:
    """
    Ensures required default Profiles exist for each Business Unit.

    Why:
    - RBAC fallback maps legacy BU role 'BU_ADMIN_ROOT' -> profile key 'admin_root'
    - and default (no profile_id) -> profile key 'customizado'
    """
    bu_ids = list(db.scalars(select(BusinessUnit.id)).all())
    if not bu_ids:
        return

    stmt = select(Profile).where(Profile.business_unit_id.in_(bu_ids))
    existing = {(p.business_unit_id, p.key): p for p in db.execute(stmt).scalars().all()}

    seeds = [
        ("admin_root", "Admin Root", ProfileKind.BU_ADMIN_ROOT.value, True),
        ("customizado", "Customizado", ProfileKind.BU_SYSTEM.value, True),
        ("ceo", "CEO", ProfileKind.BU_SYSTEM.value, True),
        ("marketing", "Marketing", ProfileKind.BU_SYSTEM.value, True),
        ("comercial", "Comercial", ProfileKind.BU_SYSTEM.value, True),
        ("academico", "Acadêmico", ProfileKind.BU_SYSTEM.value, True),
    ]

    created_any = False
    for bu_id in bu_ids:
        for key, name, kind, locked in seeds:
            if (bu_id, key) in existing:
                continue
            db.add(
                Profile(
                    business_unit_id=bu_id,
                    key=key,
                    name=name,
                    kind=kind,
                    is_locked=locked,
                )
            )
            created_any = True

    if created_any:
        db.commit()