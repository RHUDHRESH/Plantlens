"""Studio editor documents that are NOT runtime truth.

* ``studio_layout``      — node positions + viewport (projection concern, R4).
* ``studio_assembly``    — the Plant Studio assembly draft (``plant_assembly`` contract shape).
* ``connection_rules``   — the engineer-authored connection rule set used by the Studio editor.

None of these touch the causal graph, alarm rules or the runtime: saving an assembly never
approves anything (R5) and the runtime DAG keeps reading approved revisions only (R2). Each
document is stored as versioned ``authored_config_document`` rows; a ``base_revision`` that does
not match the latest row returns 409 so two editors never silently overwrite each other.
"""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_engineer, require_viewer
from app.auth.principal import Principal
from app.db.models.authored import AuthoredConfigDocument
from app.dependencies import get_db
from app.schemas.plant_assembly import PlantAssembly
from app.services.audit_chain import AuditChainService

router = APIRouter(prefix="/api/studio", tags=["studio"])

LAYOUT_DOC = "studio_layout"
ASSEMBLY_DOC = "studio_assembly"
RULES_DOC = "connection_rules"
MAX_NODES = 5_000
MAX_CONNECTIONS = 20_000
MAX_CUSTOM_RULES = 500
_audit = AuditChainService()


# ---- shared versioned-document helpers --------------------------------------------------------


async def _latest(
    session: AsyncSession, plant_id: str, doc_type: str = LAYOUT_DOC
) -> AuthoredConfigDocument | None:
    stmt = select(AuthoredConfigDocument).where(
        AuthoredConfigDocument.plant_id == plant_id, AuthoredConfigDocument.doc_type == doc_type
    )
    rows = list((await session.execute(stmt)).scalars())
    return max(rows, key=lambda r: int(r.revision)) if rows else None


def _conflict(what: str, current: int) -> HTTPException:
    return HTTPException(
        status_code=409,
        detail={
            "code": "revision_conflict",
            "message": f"{what} changed since you loaded it",
            "fix": "Reload to get the latest version, or overwrite it with yours.",
            "current_revision": current,
        },
    )


async def _save(
    session: AsyncSession,
    plant_id: str,
    doc_type: str,
    payload: dict[str, Any],
    base_revision: int | None,
    what: str,
) -> int:
    row = await _latest(session, plant_id, doc_type)
    current = int(row.revision) if row else 0
    if base_revision is not None and base_revision != current:
        raise _conflict(what, current)
    session.add(
        AuthoredConfigDocument(plant_id=plant_id, doc_type=doc_type, revision=str(current + 1), payload_json=payload)
    )
    return current + 1


# ---- layout ---------------------------------------------------------------------------------


class NodePosition(BaseModel):
    x: float = Field(ge=-1e6, le=1e6)
    y: float = Field(ge=-1e6, le=1e6)


class LayoutBody(BaseModel):
    positions: dict[str, NodePosition] = Field(default_factory=dict)
    viewport: dict[str, float] | None = None
    base_revision: int | None = Field(
        default=None, description="Revision the client edited; a mismatch returns 409 (no lost updates)."
    )


@router.get("/layout/{plant_id}")
async def get_layout(
    plant_id: str,
    _principal: Principal = Depends(require_viewer),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    row = await _latest(session, plant_id)
    if row is None:
        return {"plant_id": plant_id, "revision": 0, "positions": {}, "viewport": None}
    return {"plant_id": plant_id, "revision": int(row.revision), **row.payload_json}


@router.put("/layout/{plant_id}")
async def put_layout(
    plant_id: str,
    body: LayoutBody,
    _principal: Principal = Depends(require_engineer),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    if len(body.positions) > MAX_NODES:
        raise HTTPException(status_code=413, detail=f"At most {MAX_NODES} node positions")
    payload = {
        "positions": {k: v.model_dump() for k, v in body.positions.items()},
        "viewport": body.viewport,
    }
    revision = await _save(session, plant_id, LAYOUT_DOC, payload, body.base_revision, "Layout")
    await session.commit()
    return {"plant_id": plant_id, "revision": revision, **payload}


# ---- assembly -------------------------------------------------------------------------------


class AssemblyBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assembly: PlantAssembly
    base_revision: int | None = None


def _assembly_integrity_errors(assembly: PlantAssembly) -> list[dict[str, str]]:
    """Minimal referential checks; full engineering validation is /api/library/validate-assembly."""
    errors: list[dict[str, str]] = []
    seen: set[str] = set()
    for asset in assembly.assets:
        if asset.asset_id in seen:
            errors.append({
                "path": f"assets[{asset.asset_id}]",
                "message": f"Duplicate asset_id '{asset.asset_id}'.",
                "fix": "Give every placed component a unique asset id.",
            })
        seen.add(asset.asset_id)
    conn_ids: set[str] = set()
    for conn in assembly.connections:
        if conn.connection_id in conn_ids:
            errors.append({
                "path": f"connections[{conn.connection_id}]",
                "message": f"Duplicate connection_id '{conn.connection_id}'.",
                "fix": "Give every connection a unique id.",
            })
        conn_ids.add(conn.connection_id)
        for side, asset_id in (("from", conn.from_asset_id), ("to", conn.to_asset_id)):
            if asset_id not in seen:
                errors.append({
                    "path": f"connections[{conn.connection_id}].{side}_asset_id",
                    "message": f"Connection {conn.connection_id} references unknown asset '{asset_id}'.",
                    "fix": "Delete the connection or place the missing asset first.",
                })
        if conn.lag_max_ms < conn.lag_min_ms:
            errors.append({
                "path": f"connections[{conn.connection_id}].lag_max_ms",
                "message": f"Connection {conn.connection_id} lag window is inverted.",
                "fix": "Set lag_max_ms greater than or equal to lag_min_ms.",
            })
    return errors


@router.get("/assembly/{plant_id}")
async def get_assembly(
    plant_id: str,
    _principal: Principal = Depends(require_viewer),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    row = await _latest(session, plant_id, ASSEMBLY_DOC)
    if row is None:
        return {"plant_id": plant_id, "revision": 0, "assembly": None}
    stored = row.payload_json["assembly"]
    try:
        assembly = PlantAssembly.model_validate(stored).model_dump(mode="json", exclude_none=True)
    except ValueError:
        assembly = stored
    return {"plant_id": plant_id, "revision": int(row.revision), "assembly": assembly}


@router.put("/assembly/{plant_id}")
async def put_assembly(
    plant_id: str,
    body: AssemblyBody,
    _principal: Principal = Depends(require_engineer),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    assembly = body.assembly
    if len(assembly.assets) > MAX_NODES or len(assembly.connections) > MAX_CONNECTIONS:
        raise HTTPException(status_code=413, detail=f"At most {MAX_NODES} assets and {MAX_CONNECTIONS} connections")
    if assembly.plant_id != plant_id:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "plant_mismatch",
                "message": f"Assembly plant_id '{assembly.plant_id}' does not match '{plant_id}'.",
                "fix": "Save the assembly under its own plant id.",
            },
        )
    errors = _assembly_integrity_errors(assembly)
    if errors:
        first = errors[0]
        raise HTTPException(
            status_code=422,
            detail={"code": "assembly_invalid", "message": first["message"], "fix": first["fix"], "errors": errors},
        )
    # exclude_none: optional contract fields (position_3d) are omitted, not sent as null.
    payload = {"assembly": assembly.model_dump(mode="json", exclude_none=True)}
    revision = await _save(session, plant_id, ASSEMBLY_DOC, payload, body.base_revision, "Assembly")
    await session.commit()
    return {"plant_id": plant_id, "revision": revision, **payload}


# ---- connection rules -----------------------------------------------------------------------

Medium = Literal[
    "dc_power", "ac_power", "mechanical_rotation", "airflow", "fluid_flow", "pneumatic_air", "thermal",
    "digital_signal", "analog_signal", "serial_comm", "ethernet", "mounting",
]
Verdict = Literal["allow", "warn", "deny"]
Enforcement = Literal["warn", "deny"]
Direction = Literal["input", "output", "bidirectional"]
_RULE_ID = re.compile(r"^[A-Za-z0-9_.:-]{1,64}$")


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MediumCompatibilityRule(_Strict):
    enabled: bool = True
    check_quantity: bool = True
    matrix: dict[Medium, dict[Medium, Verdict]] = Field(default_factory=dict)


class DirectionRule(_Strict):
    enabled: bool = True
    severity: Enforcement = "deny"


class FanLimit(_Strict):
    fan_out: int | None = Field(default=None, ge=1, le=10_000)
    fan_in: int | None = Field(default=None, ge=1, le=10_000)


class MaxConnectionsRule(_Strict):
    enabled: bool = True
    severity: Enforcement = "deny"
    default: FanLimit = Field(default_factory=FanLimit)
    limits: dict[Medium, FanLimit] = Field(default_factory=dict)


class NominalRangeRule(_Strict):
    enabled: bool = True
    severity: Enforcement = "warn"
    safety_media: list[Medium] = Field(default_factory=list)


class SelfConnectionRule(_Strict):
    enabled: bool = True
    allow_same_node: bool = False


class DuplicateEdgeRule(_Strict):
    enabled: bool = True


class CyclePolicyRule(_Strict):
    enabled: bool = True
    default: Verdict = "allow"
    per_medium: dict[Medium, Verdict] = Field(default_factory=dict)


class RequiredPortsRule(_Strict):
    enabled: bool = True
    severity: Enforcement = "warn"


class TagCompatibilityRule(_Strict):
    enabled: bool = True
    severity: Enforcement = "warn"


class BuiltinRules(_Strict):
    medium_compatibility: MediumCompatibilityRule = Field(default_factory=MediumCompatibilityRule)
    direction: DirectionRule = Field(default_factory=DirectionRule)
    max_connections: MaxConnectionsRule = Field(default_factory=MaxConnectionsRule)
    nominal_range: NominalRangeRule = Field(default_factory=NominalRangeRule)
    self_connection: SelfConnectionRule = Field(default_factory=SelfConnectionRule)
    duplicate_edge: DuplicateEdgeRule = Field(default_factory=DuplicateEdgeRule)
    cycle_policy: CyclePolicyRule = Field(default_factory=CyclePolicyRule)
    required_ports: RequiredPortsRule = Field(default_factory=RequiredPortsRule)
    tag_compatibility: TagCompatibilityRule = Field(default_factory=TagCompatibilityRule)


class SideCondition(_Strict):
    categories: list[str] = Field(default_factory=list, max_length=50)
    component_type_ids: list[str] = Field(default_factory=list, max_length=200)
    directions: list[Direction] = Field(default_factory=list)
    tags_any: list[str] = Field(default_factory=list, max_length=50)
    port_ids: list[str] = Field(default_factory=list, max_length=200)


class CustomRule(_Strict):
    id: str
    name: str = Field(min_length=1, max_length=120)
    enabled: bool = True
    priority: int = Field(default=0, ge=-1000, le=1000)
    source: SideCondition = Field(default_factory=SideCondition)
    target: SideCondition = Field(default_factory=SideCondition)
    media: list[Medium] = Field(default_factory=list)
    action: Verdict
    message: str = Field(min_length=1, max_length=500)
    fix: str = Field(default="", max_length=500)

    @field_validator("id")
    @classmethod
    def _id_shape(cls, value: str) -> str:
        if not _RULE_ID.match(value):
            raise ValueError("Rule id must be 1-64 characters of letters, digits, '_', '.', ':' or '-'.")
        return value


class ConnectionRuleSet(_Strict):
    schema_version: Literal[1] = 1
    builtins: BuiltinRules = Field(default_factory=BuiltinRules)
    custom: list[CustomRule] = Field(default_factory=list, max_length=MAX_CUSTOM_RULES)

    @model_validator(mode="after")
    def _unique_ids(self) -> ConnectionRuleSet:
        ids = [rule.id for rule in self.custom]
        dupes = sorted({i for i in ids if ids.count(i) > 1})
        if dupes:
            raise ValueError(f"Custom rule ids must be unique; duplicated: {', '.join(dupes)}")
        return self


class RulesBody(_Strict):
    rules: ConnectionRuleSet
    base_revision: int | None = None


@router.get("/connection-rules/{plant_id}")
async def get_connection_rules(
    plant_id: str,
    _principal: Principal = Depends(require_viewer),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    row = await _latest(session, plant_id, RULES_DOC)
    if row is None:
        # Revision 0 = nothing authored yet; the client falls back to its built-in defaults.
        return {"plant_id": plant_id, "revision": 0, "rules": None}
    return {"plant_id": plant_id, "revision": int(row.revision), "rules": row.payload_json["rules"]}


@router.put("/connection-rules/{plant_id}")
async def put_connection_rules(
    plant_id: str,
    body: RulesBody,
    principal: Principal = Depends(require_engineer),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    payload = {"rules": body.rules.model_dump(mode="json")}
    revision = await _save(session, plant_id, RULES_DOC, payload, body.base_revision, "Connection rules")
    # Rule sets govern what engineers may draw, so every change lands in the audit ledger (R6).
    await _audit.append(
        session,
        audit_id=str(uuid.uuid4()),
        ts=datetime.now(UTC).isoformat(),
        actor_type=principal.actor_type,
        actor_id=principal.subject,
        actor_role=principal.role,
        action="studio.connection_rules.save",
        entity_type="connection_rules",
        entity_id=f"{plant_id}@{revision}",
        plant_id=plant_id,
        before=None,
        after={"revision": revision, "custom_rules": len(body.rules.custom)},
        reason=None,
    )
    await session.commit()
    return {"plant_id": plant_id, "revision": revision, **payload}
