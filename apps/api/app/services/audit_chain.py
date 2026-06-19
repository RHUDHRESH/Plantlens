"""
Audit chain — append-only, hash-chained ledger (rule R6, X-Factor 2 "receipts").

hash_self = SHA256(canonical_json(record_without_hash_self) + hash_prev.encode())
Genesis hash_prev = 64 zeroes. Tamper-evident, not tamper-proof — single trusted writer.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories import audit as audit_repo
from app.schemas.audit import AuditRecord

GENESIS_HASH = "0" * 64


class AuditIntegrityError(Exception):
    """Raised when the audit chain fails verification."""

    def __init__(self, *, broken_index: int, reason: str) -> None:
        self.broken_index = broken_index
        self.reason = reason
        super().__init__(reason)


@dataclass(frozen=True, slots=True)
class VerifyResult:
    valid: bool
    checked_records: int
    broken_index: int | None
    reason: str | None


def canonical_json_bytes(record: dict[str, Any]) -> bytes:
    """Deterministic serialization — sorted keys, no insignificant whitespace."""
    payload = {key: value for key, value in record.items() if key != "hash_self"}
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")


def compute_hash_self(record: dict[str, Any], *, hash_prev: str) -> str:
    """Compute hash_self for a record dict that excludes hash_self."""
    digest_input = canonical_json_bytes(record) + hash_prev.encode("utf-8")
    return hashlib.sha256(digest_input).hexdigest()


def verify_chain(records: list[dict[str, Any]]) -> VerifyResult:
    """Re-walk from genesis; return the first broken index on any mismatch."""
    expected_prev = GENESIS_HASH
    for index, record in enumerate(records):
        if record.get("hash_prev") != expected_prev:
            return VerifyResult(
                valid=False,
                checked_records=index,
                broken_index=index,
                reason="hash_prev does not reference the previous record hash",
            )
        expected_hash = compute_hash_self(record, hash_prev=expected_prev)
        if record.get("hash_self") != expected_hash:
            return VerifyResult(
                valid=False,
                checked_records=index,
                broken_index=index,
                reason="hash_self does not match canonical record contents",
            )
        expected_prev = str(record["hash_self"])
    return VerifyResult(
        valid=True,
        checked_records=len(records),
        broken_index=None,
        reason=None,
    )


def assert_valid_chain(records: list[dict[str, Any]]) -> None:
    result = verify_chain(records)
    if not result.valid:
        raise AuditIntegrityError(
            broken_index=result.broken_index or 0,
            reason=result.reason or "audit chain verification failed",
        )


class AuditChainService:
    """Single-writer append service — serialize concurrent appends with an async lock."""

    def __init__(self) -> None:
        self._append_lock = asyncio.Lock()

    async def append(
        self,
        session: AsyncSession,
        *,
        audit_id: str,
        ts: str,
        actor_type: str,
        action: str,
        entity_type: str,
        actor_id: str | None = None,
        actor_role: str | None = None,
        entity_id: str | None = None,
        plant_id: str | None = None,
        before: dict[str, object] | None = None,
        after: dict[str, object] | None = None,
        reason: str | None = None,
        request_id: str | None = None,
        session_id: str | None = None,
        source_ip: str | None = None,
        hash_self: str | None = None,  # ignored — never trust caller-supplied hashes
    ) -> AuditRecord:
        """Append one record; spoofed hash_self from callers is ignored."""
        _ = hash_self
        async with self._append_lock:
            existing = await audit_repo.list_records_ordered(session)
            existing_dicts = [audit_repo.row_to_record_dict(row) for row in existing]
            assert_valid_chain(existing_dicts)

            hash_prev = await audit_repo.get_head_hash(session) or GENESIS_HASH
            unsigned: dict[str, Any] = {
                "audit_id": audit_id,
                "ts": audit_repo.normalize_ts_string(ts),
                "actor_type": actor_type,
                "action": action,
                "entity_type": entity_type,
                "hash_prev": hash_prev,
            }
            for key, value in (
                ("actor_id", actor_id),
                ("actor_role", actor_role),
                ("entity_id", entity_id),
                ("plant_id", plant_id),
                ("before", before),
                ("after", after),
                ("reason", reason),
                ("request_id", request_id),
                ("session_id", session_id),
                ("source_ip", source_ip),
            ):
                if value is not None:
                    unsigned[key] = value

            sealed_hash = compute_hash_self(unsigned, hash_prev=hash_prev)
            sealed = {**unsigned, "hash_self": sealed_hash}
            validated = AuditRecord.model_validate(sealed)
            record_dict = validated.model_dump(mode="json")
            await audit_repo.append_record(session, record_dict)
            return validated

    async def list_verified(self, session: AsyncSession) -> list[AuditRecord]:
        """Load all records and verify the full chain before returning."""
        rows = await audit_repo.list_records_ordered(session)
        record_dicts = [audit_repo.row_to_record_dict(row) for row in rows]
        assert_valid_chain(record_dicts)
        return [AuditRecord.model_validate(record) for record in record_dicts]