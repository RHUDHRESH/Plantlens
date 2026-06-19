"""Audit hash-chain tests (Prompt 13) and audit guardian (Prompt 14)."""

from __future__ import annotations

import hashlib
import importlib
import json
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import models  # noqa: F401 — register ORM metadata
from app.db.base import Base
from app.db.repositories import audit as audit_repo
from app.db.session import (
    dispose_db_engine,
    get_session_factory,
    init_db_engine,
    is_db_initialized,
    reset_db_state_for_tests,
)
from app.services.audit_chain import (
    GENESIS_HASH,
    AuditChainService,
    AuditIntegrityError,
    canonical_json_bytes,
    compute_hash_self,
    verify_chain,
)

API_ROOT = Path(__file__).resolve().parents[1]
TS_1 = "2026-06-18T12:00:00Z"
TS_2 = "2026-06-18T12:01:00Z"
TS_3 = "2026-06-18T12:02:00Z"


def _sample_record(
    *,
    audit_id: str,
    ts: str = TS_1,
    action: str = "compile.run",
    hash_prev: str = GENESIS_HASH,
    hash_self: str | None = None,
    plant_id: str = "demo_microgrid_001",
) -> dict[str, object]:
    unsigned: dict[str, object] = {
        "audit_id": audit_id,
        "ts": ts,
        "actor_type": "system",
        "action": action,
        "entity_type": "compiled_model",
        "entity_id": "bundle-v1",
        "plant_id": plant_id,
        "hash_prev": hash_prev,
    }
    sealed_hash = hash_self or compute_hash_self(unsigned, hash_prev=hash_prev)
    return {**unsigned, "hash_self": sealed_hash}


@pytest.fixture
async def db_session() -> AsyncSession:
    if is_db_initialized():
        await dispose_db_engine()
        reset_db_state_for_tests()

    init_db_engine("sqlite+aiosqlite:///:memory:")
    factory = get_session_factory()
    async with factory() as session:
        conn = await session.connection()
        await conn.run_sync(Base.metadata.create_all)
        await session.commit()

    async with factory() as session:
        yield session

    await dispose_db_engine()
    reset_db_state_for_tests()


@pytest.fixture
def chain_service() -> AuditChainService:
    return AuditChainService()


# --- Prompt 13: core hash semantics ---


def test_canonical_json_is_deterministic_for_nested_keys():
    left = {"z": 1, "nested": {"b": 2, "a": 1}, "audit_id": "A"}
    right = {"audit_id": "A", "nested": {"a": 1, "b": 2}, "z": 1}
    assert canonical_json_bytes(left) == canonical_json_bytes(right)


def test_compute_hash_self_matches_manual_sha256():
    record = {
        "audit_id": "01J6",
        "ts": TS_1,
        "actor_type": "system",
        "action": "situation.created",
        "entity_type": "situation",
        "hash_prev": GENESIS_HASH,
    }
    payload = canonical_json_bytes(record) + GENESIS_HASH.encode("utf-8")
    expected = hashlib.sha256(payload).hexdigest()
    assert compute_hash_self(record, hash_prev=GENESIS_HASH) == expected


@pytest.mark.asyncio
async def test_append_round_trip_and_verify(
    db_session: AsyncSession,
    chain_service: AuditChainService,
):
    first = await chain_service.append(
        db_session,
        audit_id="audit-001",
        ts=TS_1,
        actor_type="system",
        action="compile.run",
        entity_type="compiled_model",
        plant_id="demo_microgrid_001",
    )
    second = await chain_service.append(
        db_session,
        audit_id="audit-002",
        ts=TS_2,
        actor_type="user",
        action="alarm.ack",
        entity_type="alarm",
        actor_id="op-1",
        actor_role="operator",
        entity_id="ALARM-1",
    )
    assert first.hash_prev == GENESIS_HASH
    assert second.hash_prev == first.hash_self

    records = await chain_service.list_verified(db_session)
    assert len(records) == 2
    assert records[0].audit_id == "audit-001"
    assert records[1].audit_id == "audit-002"


@pytest.mark.asyncio
async def test_append_ignores_spoofed_hash_self(
    db_session: AsyncSession,
    chain_service: AuditChainService,
):
    record = await chain_service.append(
        db_session,
        audit_id="audit-spoof",
        ts=TS_1,
        actor_type="system",
        action="compile.run",
        entity_type="compiled_model",
        hash_self="f" * 64,
    )
    assert record.hash_self != "f" * 64
    assert len(record.hash_self) == 64


@pytest.mark.asyncio
async def test_tamper_detection_on_read(
    db_session: AsyncSession,
    chain_service: AuditChainService,
):
    await chain_service.append(
        db_session,
        audit_id="audit-tamper",
        ts=TS_1,
        actor_type="system",
        action="compile.run",
        entity_type="compiled_model",
    )
    rows = await audit_repo.list_records_ordered(db_session)
    rows[0].action = "compile.run.tampered"
    await db_session.flush()

    with pytest.raises(AuditIntegrityError) as exc:
        await chain_service.list_verified(db_session)
    assert exc.value.reason == "hash_self does not match canonical record contents"


def test_verify_chain_detects_reorder():
    first = _sample_record(audit_id="a1", ts=TS_1)
    second = _sample_record(
        audit_id="a2",
        ts=TS_2,
        hash_prev=first["hash_self"],  # type: ignore[arg-type]
    )
    result = verify_chain([second, first])  # type: ignore[list-item]
    assert not result.valid
    assert result.broken_index == 0


def test_verify_chain_detects_truncation():
    first = _sample_record(audit_id="a1", ts=TS_1)
    second = _sample_record(
        audit_id="a2",
        ts=TS_2,
        hash_prev=first["hash_self"],  # type: ignore[arg-type]
    )
    third = _sample_record(
        audit_id="a3",
        ts=TS_3,
        hash_prev=second["hash_self"],  # type: ignore[arg-type]
    )
    result = verify_chain([first, third])  # type: ignore[list-item]
    assert not result.valid
    assert result.broken_index == 1


# --- Prompt 14: audit guardian ---


def test_verify_chain_detects_duplicate_record():
    first = _sample_record(audit_id="a1", ts=TS_1)
    duplicate = dict(first)
    result = verify_chain([first, duplicate])  # type: ignore[list-item]
    assert not result.valid
    assert result.broken_index == 1


def test_verify_chain_detects_insertion_attack():
    genesis = _sample_record(audit_id="a1", ts=TS_1)
    middle = _sample_record(
        audit_id="a2",
        ts=TS_2,
        hash_prev=genesis["hash_self"],  # type: ignore[arg-type]
    )
    inserted = _sample_record(audit_id="evil", ts="2026-06-18T12:00:30Z")
    tail = _sample_record(
        audit_id="a3",
        ts=TS_3,
        hash_prev=middle["hash_self"],  # type: ignore[arg-type]
    )
    result = verify_chain([genesis, inserted, middle, tail])  # type: ignore[list-item]
    assert not result.valid
    assert result.broken_index == 1


def test_nested_key_order_does_not_change_hash():
    record_a = {
        "audit_id": "nested",
        "ts": TS_1,
        "actor_type": "system",
        "action": "graph.edge.update",
        "entity_type": "causal_edge",
        "before": {"metrics": {"b": 2, "a": 1}},
        "after": {"metrics": {"d": 4, "c": 3}},
        "hash_prev": GENESIS_HASH,
    }
    record_b = {
        "audit_id": "nested",
        "ts": TS_1,
        "actor_type": "system",
        "action": "graph.edge.update",
        "entity_type": "causal_edge",
        "after": {"metrics": {"c": 3, "d": 4}},
        "before": {"metrics": {"a": 1, "b": 2}},
        "hash_prev": GENESIS_HASH,
    }
    assert compute_hash_self(record_a, hash_prev=GENESIS_HASH) == compute_hash_self(
        record_b, hash_prev=GENESIS_HASH
    )


def test_audit_repository_has_no_update_or_delete_helpers():
    repo = importlib.import_module("app.db.repositories.audit")
    names = {
        name
        for name in dir(repo)
        if not name.startswith("_") and callable(getattr(repo, name))
    }
    assert "append_record" in names
    assert "list_records_ordered" in names
    assert "get_head_hash" in names
    forbidden = {name for name in names if name.startswith(("update", "delete", "remove"))}
    assert not forbidden


def test_audit_chain_service_documents_single_writer_lock():
    source = (API_ROOT / "app" / "services" / "audit_chain.py").read_text(encoding="utf-8")
    assert "_append_lock" in source
    assert "asyncio.Lock" in source


@pytest.mark.asyncio
async def test_row_round_trip_preserves_canonical_bytes(
    db_session: AsyncSession,
    chain_service: AuditChainService,
):
    await chain_service.append(
        db_session,
        audit_id="round-trip",
        ts=TS_1,
        actor_type="user",
        action="approval.grant",
        entity_type="agent_draft",
        actor_id="eng-1",
        actor_role="engineer",
        reason="looks good",
        before={"status": "proposed"},
        after={"status": "approved"},
    )
    rows = await audit_repo.list_records_ordered(db_session)
    record_dict = audit_repo.row_to_record_dict(rows[0])
    result = verify_chain([record_dict])
    assert result.valid


def test_genesis_hash_is_sixty_four_zeroes():
    assert len(GENESIS_HASH) == 64
    assert set(GENESIS_HASH) == {"0"}


def test_canonical_json_excludes_hash_self_field():
    record = _sample_record(audit_id="x")
    raw = canonical_json_bytes(record)
    parsed = json.loads(raw.decode("utf-8"))
    assert "hash_self" not in parsed
    assert "hash_prev" in parsed