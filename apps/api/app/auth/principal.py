"""Auth principal and role definitions."""

from dataclasses import dataclass
from typing import Literal

Role = Literal["viewer", "engineer", "operator", "maintenance", "admin", "agent"]
ActorType = Literal["user", "agent", "system"]

HUMAN_APPROVER_ROLES: frozenset[Role] = frozenset(
    {"operator", "engineer", "maintenance", "admin"}
)
ENGINEER_WRITE_ROLES: frozenset[Role] = frozenset({"engineer", "admin"})
ADMIN_ROLES: frozenset[Role] = frozenset({"admin"})


@dataclass(frozen=True, slots=True)
class Principal:
    """Authenticated caller resolved from a verified bearer token."""

    subject: str
    role: Role
    actor_type: ActorType
    display_name: str | None = None

    @property
    def is_agent(self) -> bool:
        return self.role == "agent" or self.actor_type == "agent"

    @property
    def is_human(self) -> bool:
        return not self.is_agent