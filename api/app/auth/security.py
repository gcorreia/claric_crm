from __future__ import annotations

"""Password hashing utilities.

We default to Argon2 (recommended) and keep bcrypt only for verifying legacy hashes.
"""

from passlib.context import CryptContext

PWD_CONTEXT = CryptContext(
    schemes=["argon2", "bcrypt"],
    deprecated="auto",
)

def hash_password(password: str) -> str:
    """Hash a plaintext password."""
    if not password:
        raise ValueError("Password must not be empty.")
    # Argon2 has no 72-byte bcrypt truncation limit.
    return PWD_CONTEXT.hash(password)

def verify_password(password: str, password_hash: str) -> bool:
    """Verify a plaintext password against a stored hash."""
    if not password_hash:
        return False
    return PWD_CONTEXT.verify(password, password_hash)
