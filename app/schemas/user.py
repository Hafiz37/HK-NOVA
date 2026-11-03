"""Public user payloads; password hashes are never serialized."""
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.user import UserRole

Password = Annotated[str, Field(min_length=8, max_length=72)]


def validate_password(value: str) -> str:
    if len(value.encode("utf-8")) > 72:
        raise ValueError("Password must not exceed 72 UTF-8 bytes")
    return value


class UserBase(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[A-Za-z0-9_-]+$")
    full_name: str | None = Field(default=None, max_length=100)
    role: UserRole = UserRole.viewer
    is_active: bool = True


class UserCreate(UserBase):
    model_config = ConfigDict(extra="forbid")
    password: Password
    _password_bytes = field_validator("password")(validate_password)


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    full_name: str | None = Field(default=None, max_length=100)
    role: UserRole | None = None
    is_active: bool | None = None

    @field_validator("role", "is_active")
    @classmethod
    def disallow_null(cls, value: UserRole | bool | None) -> UserRole | bool:
        if value is None:
            raise ValueError("Role and active status cannot be null")
        return value


class PasswordChange(BaseModel):
    current_password: str
    new_password: Password
    _password_bytes = field_validator("new_password")(validate_password)


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)
    # Existing bootstrap usernames predate the new create-user validation.
    username: str
    id: int
    created_at: datetime
    updated_at: datetime | None
