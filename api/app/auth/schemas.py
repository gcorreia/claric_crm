from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field

try:
    # Pydantic v2
    from pydantic import AliasChoices
except Exception:  # pragma: no cover
    AliasChoices = None  # type: ignore


class LoginRequest(BaseModel):
    """
    Accepts either:
      - { "email": "...", "password": "..." }
      - { "username": "...", "password": "..." }
      - { "login": "...", "password": "..." }
    Why: prevents 422 when frontend/backend drift on key naming.
    """

    if AliasChoices:
        login: EmailStr = Field(validation_alias=AliasChoices("email", "username", "login"))
    else:
        # Fallback: older pydantic; expects "email"
        login: EmailStr = Field(alias="email")

    password: str = Field(min_length=1)

    @property
    def email(self) -> EmailStr:
        # Why: older code reads payload.email
        return self.login


class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: str | None = None
    is_active: bool
    is_root: bool = False


class BusinessUnitOut(BaseModel):
    id: str
    name: str
    address: str


class LoginResponse(BaseModel):
    user: UserOut
    csrf_token: str
    business_units: list[BusinessUnitOut]
    active_bu: BusinessUnitOut
    active_bu_role: str | None = None
    active_profile_key: str | None = None


class MeResponse(BaseModel):
    user: UserOut
    business_units: list[BusinessUnitOut]
    active_bu: BusinessUnitOut | None = None
    active_bu_role: str | None = None
    active_profile_key: str | None = None


class CsrfResponse(BaseModel):
    csrf_token: str
