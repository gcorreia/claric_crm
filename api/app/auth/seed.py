from __future__ import annotations

from sqlalchemy.orm import Session

from app.auth.security import hash_password
from app.core.config import settings
from app.models.user import User


def ensure_seed_admin(db: Session) -> None:
    email = settings.SEED_ADMIN_EMAIL.strip().lower()
    password = settings.SEED_ADMIN_PASSWORD
    existing = db.query(User).filter(User.email == email).one_or_none()
    if existing:
        return
    user = User(email=email, name="Admin", password_hash=hash_password(password), is_active=True, is_root=True)
    db.add(user)
    db.commit()
