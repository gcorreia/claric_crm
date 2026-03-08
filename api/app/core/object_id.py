from __future__ import annotations

"""Object ID generator.

This implements a 15-character case-sensitive ID plus a 3-character checksum suffix,
yielding an 18-character ID that is case-insensitive friendly.

Format:
- First 3 characters: object prefix (A-Z0-9), fixed per model/table.
- Next 12 characters: random base62 payload.
- Optional checksum: 3 characters (A-Z0-5) computed from uppercase positions.

Store the 18-character form in the database to avoid case-folding issues.
"""

import re
import secrets

_BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
_CHECKSUM32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345"

_ID15_RE = re.compile(r"^[A-Z0-9]{3}[0-9A-Za-z]{12}$")
_ID18_RE = re.compile(r"^[A-Z0-9]{3}[0-9A-Za-z]{12}[A-Z0-5]{3}$")


class ObjectIdError(ValueError):
    """Raised when an object ID is invalid."""


def new_id15(prefix: str) -> str:
    """Generate a new 15-character ID for a given 3-char prefix."""
    if not re.fullmatch(r"[A-Z0-9]{3}", prefix or ""):
        raise ObjectIdError("prefix must be exactly 3 characters: A-Z0-9")
    tail = "".join(secrets.choice(_BASE62) for _ in range(12))
    return f"{prefix}{tail}"


def to_id18(id15: str) -> str:
    """Convert a 15-character ID into an 18-character checksummed ID."""
    if not _ID15_RE.fullmatch(id15 or ""):
        raise ObjectIdError("id15 must be 15 chars: prefix(3) + base62(12)")
    suffix_chars: list[str] = []
    for chunk_index in range(3):
        chunk = id15[chunk_index * 5 : (chunk_index + 1) * 5]
        bits = 0
        for pos, ch in enumerate(chunk):
            if "A" <= ch <= "Z":
                bits |= 1 << pos
        suffix_chars.append(_CHECKSUM32[bits])
    return id15 + "".join(suffix_chars)


def new_id18(prefix: str) -> str:
    """Generate a new 18-character checksummed ID."""
    return to_id18(new_id15(prefix))


def is_id15(value: str) -> bool:
    return bool(_ID15_RE.fullmatch(value or ""))


def is_id18(value: str) -> bool:
    return bool(_ID18_RE.fullmatch(value or ""))


def validate_id(value: str) -> str:
    """Validate 15 or 18 char IDs; for 18, also validate checksum."""
    if is_id15(value):
        return value
    if not is_id18(value):
        raise ObjectIdError("invalid object id")
    base = value[:15]
    expected = to_id18(base)
    if value != expected:
        raise ObjectIdError("invalid checksum")
    return value


def normalize_id(value: str) -> str:
    """Return 18-char normalized ID (adds checksum if given 15-char)."""
    if is_id18(value):
        validate_id(value)
        return value
    if is_id15(value):
        return to_id18(value)
    raise ObjectIdError("invalid object id")