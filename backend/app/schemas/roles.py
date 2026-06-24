"""Role definitions + view templates (Domain N)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class ViewSpec(BaseModel):
    widgets: list[str]  # widget keys rendered for this role
    relevance_weights: dict[str, float] = {}


class RoleSpec(BaseModel):
    role: Literal["operator", "maintenance", "supervisor", "engineer"]
    identity_priority: list[str] = ["rfid", "face", "fingerprint", "pin"]
    view: ViewSpec
    press_hold_ms: int = 1500  # tunable per site
    two_person_confirm_after_hour: int = 2  # 2-5am double-confirm window start


class RoleConfig(BaseModel):
    roles: list[RoleSpec]
