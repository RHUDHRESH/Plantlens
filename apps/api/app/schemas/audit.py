"""Mirror of packages/contracts/audit.schema.json."""

from pydantic import AwareDatetime, BaseModel, ConfigDict

from app.schemas.common import ActorRole, ActorType


class AuditRecord(BaseModel):
    """Append-only hash-chained accountability record."""

    model_config = ConfigDict(extra="forbid")

    audit_id: str
    ts: AwareDatetime
    actor_type: ActorType
    action: str
    entity_type: str
    hash_prev: str
    hash_self: str
    actor_id: str | None = None
    actor_role: ActorRole | None = None
    entity_id: str | None = None
    plant_id: str | None = None
    before: dict[str, object] | None = None
    after: dict[str, object] | None = None
    reason: str | None = None
    request_id: str | None = None
    session_id: str | None = None
    source_ip: str | None = None