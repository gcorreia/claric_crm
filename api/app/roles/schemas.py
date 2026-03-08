from __future__ import annotations

from pydantic import BaseModel, Field


class PermissionItem(BaseModel):
    app: str = Field(min_length=1, max_length=60)
    resource: str = Field(min_length=1, max_length=60)
    action: str = Field(min_length=1, max_length=20)


class RoleOut(BaseModel):
    id: str
    business_unit_id: str | None
    key: str
    name: str
    kind: str
    is_locked: bool


class RoleCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)


class RoleUpdate(BaseModel):
    name: str = Field(min_length=2, max_length=120)


class RolePermissionsUpdate(BaseModel):
    permissions: list[PermissionItem]


class RolePermissionsOut(BaseModel):
    permissions: list[PermissionItem]
