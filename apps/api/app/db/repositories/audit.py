"""Append-only audit ledger repository — no update/delete helpers."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.audit import AuditRecordRow

AUDIT_OPTIONAL_FIELDS = (
    "actor_id",
    "actor_role",
    "entity_id",
    "plant_id",
    "before",
    "after",
    "request_id",
    "session_id",
    "source_ip",
)


def normalize_ts_string(ts: str | datetime) -> str:
    """Canonical UTC ISO-8601 with Z suffix — must match hash input on append."""
    if isinstance(ts, datetime):
        aware = ts if ts.tzinfo is not None else ts.replace(tzinfo=timezone.utc)
        iso = aware.astimezone(timezone.utc).isoformat()
    else:
        iso = datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
    return iso.replace("+00:00", "Z")


def _format_ts(ts: datetime) -> str:
    return normalize_ts_string(ts)


def row_to_record_dict(row: AuditRecordRow) -> dict[str, object]:
    """Reconstruct the contract record dict used for hash verification."""
    record: dict[str, object] = {
        "audit_id": row.audit_id,
        "ts": _format_ts(row.ts),
        "actor_type": row.actor_type,
        "action": row.action,
        "entity_type": row.entity_type,
        "hash_prev": row.hash_prev,
        "hash_self": row.hash_self,
    }
    if row.payload_json:
        for key, value in row.payload_json.items():
            if key not in record:
                record[key] = value
    if row.reason is not None:
        record["reason"] = row.reason
    return record


def split_record_fields(record: dict[str, object]) -> tuple[dict[str, object], dict[str, object] | None, str | None]:
    """Split a record dict into core columns, optional payload, and reason."""
    payload: dict[str, object] = {}
    reason: str | None = None
    for key in AUDIT_OPTIONAL_FIELDS:
        if key in record and record[key] is not None:
            payload[key] = record[key]
    if "reason" in record and record["reason"] is not None:
        reason = str(record["reason"])
    core = {
        "audit_id": record["audit_id"],
        "ts": record["ts"],
        "actor_type": record["actor_type"],
        "action": record["action"],
        "entity_type": record["entity_type"],
        "hash_prev": record["hash_prev"],
        "hash_self": record["hash_self"],
    }
    return core, payload or None, reason


async def list_records_ordered(session: AsyncSession) -> list[AuditRecordRow]:
    """Return all audit rows in chain order (ts, then audit_id)."""
    result = await session.execute(
        select(AuditRecordRow).order_by(AuditRecordRow.ts.asc(), AuditRecordRow.audit_id.asc())
    )
    return list(result.scalars().all())


async def get_head_hash(session: AsyncSession) -> str | None:
    """Return hash_self of the latest record, or None when the chain is empty."""
    rows = await list_records_ordered(session)
    if not rows:
        return None
    return rows[-1].hash_self


async def append_record(session: AsyncSession, record: dict[str, object]) -> AuditRecordRow:
    """Insert one audit row. Caller must verify the chain before persisting."""
    core, payload, reason = split_record_fields(record)
    ts_value = core["ts"]
    if isinstance(ts_value, str):
        ts_parsed = datetime.fromisoformat(ts_value.replace("Z", "+00:00"))
    else:
        ts_parsed = ts_value  # type: ignore[assignment]
    if ts_parsed.tzinfo is None:
        ts_parsed = ts_parsed.replace(tzinfo=timezone.utc)

    row = AuditRecordRow(
        audit_id=str(core["audit_id"]),
        ts=ts_parsed,
        actor_type=str(core["actor_type"]),
        action=str(core["action"]),
        entity_type=str(core["entity_type"]),
        hash_prev=str(core["hash_prev"]),
        hash_self=str(core["hash_self"]),
        payload_json=payload,
        reason=reason,
    )
    session.add(row)
    await session.flush()
    return row