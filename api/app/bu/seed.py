from __future__ import annotations

import re

from sqlalchemy.orm import Session

from app.auth.security import hash_password
from app.core.config import settings
from app.models.business_unit import BusinessUnit
from app.models.business_unit_user import BuRole, BusinessUnitUser
from app.models.user import User


def _slug(s: str) -> str:
    s = s.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-") or "bu"


def ensure_seed_business_units(db: Session) -> None:
    seeds = [
        ("Escola 1", "Rua das Flores, 123 - Centro, São Paulo/SP"),
        ("Escola 2", "Av. Brasil, 456 - Jardim América, Rio de Janeiro/RJ"),
    ]

    bus_by_name = {bu.name: bu for bu in db.query(BusinessUnit).all()}
    created_any = False

    for name, address in seeds:
        bu = bus_by_name.get(name)
        if not bu:
            bu = BusinessUnit(name=name, address=address)
            db.add(bu)
            db.flush()  # get bu.id
            bus_by_name[name] = bu
            created_any = True

        # Ensure each BU has a non-deletable admin root user
        if bu.admin_root_user_id:
            continue

        email = f"admin.{_slug(name)}@seed.example.com"
        user = db.query(User).filter(User.email == email).one_or_none()
        if not user:
            user = User(
                email=email,
                name=f"Admin {name}",
                password_hash=hash_password(settings.SEED_BU_ADMIN_PASSWORD),
                is_active=True,
                is_root=False,
            )
            db.add(user)
            db.flush()

        bu.admin_root_user_id = user.id
        db.add(BusinessUnitUser(business_unit_id=bu.id, user_id=user.id, role=BuRole.BU_ADMIN_ROOT.value))
        created_any = True

    if created_any:
        db.commit()
