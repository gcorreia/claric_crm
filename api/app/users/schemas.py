from __future__ import annotations

import datetime as dt
from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8, max_length=200)
    is_active: bool = True
    profile_id: str | None = None  # Optional: admins may pick; default is CEO


class UserUpdate(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    is_active: bool = True
    password: str | None = Field(default=None, min_length=8, max_length=200)


class UserStatusUpdate(BaseModel):
    is_active: bool


class UserProfileOut(BaseModel):
    id: str
    key: str
    name: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: str | None = None
    is_active: bool
    is_root: bool
    last_login_at: dt.datetime | None = None
    created_at: dt.datetime
    updated_at: dt.datetime
    profile: UserProfileOut | None = None


class UserProfileUpdate(BaseModel):
    profile_id: str
