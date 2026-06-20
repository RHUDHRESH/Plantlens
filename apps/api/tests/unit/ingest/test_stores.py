"""Unit tests for offline ingestion storage backends."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.ingest.stores import (
    FileRawArtifactStore,
    FileRunStore,
    MemoryRawArtifactStore,
    MemoryRunStore,
    StoreError,
    StoreIntegrityError,
)
from app.schemas.ingest import (
    DraftContract,
    GateReport,
    IngestionRunReport,
    IngestionTotals,
    MappingCandidate,
    NormalizedRecord,
    QuarantineRecord,
    RawArtifact,
    RawRecord,
    SourceRef,
)
from app.settings import Settings

RUN_ID = "run_00000000-0000-4000-8000-000000000001"
RUN_ID_2 = "run_00000000-0000-4000-8000-000000000002"
ART_ID = "art_00000000-0000-4000-8000-000000000001"
RAW_ID = "raw_00000000-0000-4000-8000-000000000001"
NRM_ID = "nrm_00000000-0000-4000-8000-000000000001"
MAP_ID = "map_00000000-0000-4000-8000-000000000001"
QRN_ID = "qrn_00000000-0000-4000-8000-000000000001"
DRF_ID = "drf_00000000-0000-4000-8000-000000000001"
SHA256 = "a" * 64
TS = datetime(2026, 6, 20, 12, 0, 0, tzinfo=UTC)
SAMPLE_BYTES = b"asset_label,signal_label\nSolar Charger,Voltage\n"


def _source_ref(**overrides: object) -> SourceRef:
    base = {
        "artifact_id": ART_ID,
        "artifact_sha256": SHA256,
        "row_number": 1,
        "column_name": "unit",
    }
    base.update(overrides)
    return SourceRef(**base)  # type: ignore[arg-type]


def _raw_artifact(**overrides: object) -> RawArtifact:
    base = {
        "artifact_id": ART_ID,
        "run_id": RUN_ID,
        "received_at_utc": TS,
        "size_bytes": len(SAMPLE_BYTES),
        "sha256": hashlib.sha256(SAMPLE_BYTES).hexdigest(),
        "source_channel": "upload",
        "raw_uri": "memory://raw/test",
    }
    base.update(overrides)
    return RawArtifact(**base)  # type: ignore[arg-type]


def _raw_record() -> RawRecord:
    return RawRecord(
        raw_id=RAW_ID,
        artifact_id=ART_ID,
        run_id=RUN_ID,
        row_number=1,
        fields={"asset_label": "Solar Charger", "signal_label": "Voltage"},
        source_ref=_source_ref(),
        extracted_at_utc=TS,
    )


def _normalized_record() -> NormalizedRecord:
    return NormalizedRecord(
        record_id=NRM_ID,
        run_id=RUN_ID,
        artifact_id=ART_ID,
        raw_id=RAW_ID,
        record_kind="tag_candidate",
        tag_id="CHG_SOLAR_OUT_V",
        asset_id="CHG-SOLAR",
        asset_label="Solar Charger",
        signal_label="Output Voltage",
        unit="V",
        source_ref=_source_ref(),
        confidence=0.95,
    )


def _mapping_candidate() -> MappingCandidate:
    return MappingCandidate(
        mapping_id=MAP_ID,
        run_id=RUN_ID,
        artifact_id=ART_ID,
        source_record_id=NRM_ID,
        target_type="tag",
        issue="UNKNOWN_TAG",
        raw_value="V1",
        source_ref=_source_ref(),
    )


def _gate_report() -> GateReport:
    return GateReport(
        gate_name="canonical_schema",
        verdict="pass",
        accepted=1,
        rejected=0,
    )


def _quarantine_record() -> QuarantineRecord:
    return QuarantineRecord(
        quarantine_id=QRN_ID,
        run_id=RUN_ID,
        artifact_id=ART_ID,
        reason="schema_failed",
        severity="HIGH",
        message="Missing unit",
        suggested_fix="Populate the unit column",
        created_at_utc=TS,
    )


def _draft_contract() -> DraftContract:
    return DraftContract(
        draft_id=DRF_ID,
        run_id=RUN_ID,
        draft_type="tag_draft",
        source_artifact_ids=[ART_ID],
        source_record_ids=[NRM_ID],
        payload={"tag_id": "CHG_SOLAR_OUT_V", "unit": "V"},
        confidence=0.95,
        created_at_utc=TS,
        created_by="engineer@test",
    )


def _ingestion_report() -> IngestionRunReport:
    return IngestionRunReport(
        run_id=RUN_ID,
        started_at_utc=TS,
        status="completed",
        totals=IngestionTotals(
            files_received=1,
            total_records=1,
            parsed_records=1,
            normalized_records=1,
            mapped_records=0,
            drafts_created=1,
            quarantined_records=0,
            manual_review_count=0,
        ),
        triggered_by="engineer@test",
    )


def test_file_raw_store_put_bytes_creates_raw_artifact(tmp_path):
    store = FileRawArtifactStore(tmp_path)
    artifact = store.put_bytes(
        run_id=RUN_ID,
        content=SAMPLE_BYTES,
        source_channel="upload",
        original_filename="signal_list.csv",
    )

    assert artifact.artifact_id.startswith("art_")
    assert artifact.run_id == RUN_ID
    assert artifact.sha256 == hashlib.sha256(SAMPLE_BYTES).hexdigest()
    assert (tmp_path / "raw" / artifact.sha256).exists()
    assert store.get_bytes(artifact) == SAMPLE_BYTES


def test_file_raw_store_duplicate_hash_detected(tmp_path):
    store = FileRawArtifactStore(tmp_path)
    first = store.put_bytes(run_id=RUN_ID, content=SAMPLE_BYTES, source_channel="upload")
    second = store.put_bytes(run_id=RUN_ID_2, content=SAMPLE_BYTES, source_channel="paste")

    assert second.duplicate_of_artifact_id == first.artifact_id
    assert first.artifact_id != second.artifact_id
    assert store.get_artifact(first.artifact_id).artifact_id == first.artifact_id
    assert store.get_artifact(second.artifact_id).duplicate_of_artifact_id == first.artifact_id
    assert len(list((tmp_path / "raw").iterdir())) == 1


def test_file_raw_store_detects_tampered_raw_bytes(tmp_path):
    store = FileRawArtifactStore(tmp_path)
    artifact = store.put_bytes(run_id=RUN_ID, content=SAMPLE_BYTES, source_channel="upload")
    raw_path = tmp_path / "raw" / artifact.sha256
    raw_path.write_bytes(b"tampered")

    with pytest.raises(StoreIntegrityError):
        store.get_bytes(artifact)


def test_file_run_store_create_run_and_manifest(tmp_path):
    store = FileRunStore(tmp_path)
    manifest = store.create_run(RUN_ID, triggered_by="engineer@test", plant_id="demo")

    assert manifest["run_id"] == RUN_ID
    assert manifest["triggered_by"] == "engineer@test"
    assert manifest["created_at_utc"]
    assert manifest["updated_at_utc"]
    assert manifest["files"] == {}
    assert store.get_manifest(RUN_ID)["run_id"] == RUN_ID


def test_file_run_store_rejects_duplicate_run_id(tmp_path):
    store = FileRunStore(tmp_path)
    store.create_run(RUN_ID, triggered_by="engineer@test")

    with pytest.raises(StoreError):
        store.create_run(RUN_ID, triggered_by="engineer@test")


def test_file_run_store_save_and_load_artifact(tmp_path):
    store = FileRunStore(tmp_path)
    store.create_run(RUN_ID, triggered_by="engineer@test")
    artifact = _raw_artifact(raw_uri=str(tmp_path / "raw" / "abc"))
    store.save_artifact(RUN_ID, artifact)

    loaded = store.get_artifact(RUN_ID)
    assert loaded.artifact_id == ART_ID
    assert loaded.run_id == RUN_ID
    assert loaded.sha256 == artifact.sha256


def test_file_run_store_save_and_load_lists(tmp_path):
    store = FileRunStore(tmp_path)
    store.create_run(RUN_ID, triggered_by="engineer@test")

    store.save_raw_records(RUN_ID, [_raw_record()])
    store.save_normalized_records(RUN_ID, [_normalized_record()])
    store.save_mapping_candidates(RUN_ID, [_mapping_candidate()])
    store.save_gate_reports(RUN_ID, [_gate_report()])
    store.save_quarantine(RUN_ID, [_quarantine_record()])
    store.save_drafts(RUN_ID, [_draft_contract()])

    assert store.get_raw_records(RUN_ID)[0].raw_id == RAW_ID
    assert store.get_normalized_records(RUN_ID)[0].record_id == NRM_ID
    assert store.get_mapping_candidates(RUN_ID)[0].mapping_id == MAP_ID
    assert store.get_gate_reports(RUN_ID)[0].gate_name == "canonical_schema"
    assert store.get_quarantine(RUN_ID)[0].quarantine_id == QRN_ID
    assert store.get_drafts(RUN_ID)[0].draft_id == DRF_ID


def test_file_run_store_save_and_load_report(tmp_path):
    store = FileRunStore(tmp_path)
    store.create_run(RUN_ID, triggered_by="engineer@test")
    report = _ingestion_report()
    store.save_report(RUN_ID, report)

    loaded = store.get_report(RUN_ID)
    assert loaded.run_id == RUN_ID
    assert loaded.totals.normalized_records == 1
    assert loaded.totals.drafts_created == 1


def test_file_run_store_missing_optional_lists_return_empty(tmp_path):
    store = FileRunStore(tmp_path)
    store.create_run(RUN_ID, triggered_by="engineer@test")

    assert store.get_raw_records(RUN_ID) == []
    assert store.get_quarantine(RUN_ID) == []


def test_memory_raw_store_matches_duplicate_semantics():
    store = MemoryRawArtifactStore()
    first = store.put_bytes(run_id=RUN_ID, content=SAMPLE_BYTES, source_channel="upload")
    second = store.put_bytes(run_id=RUN_ID_2, content=SAMPLE_BYTES, source_channel="upload")

    assert second.duplicate_of_artifact_id == first.artifact_id
    assert store.get_bytes(second) == SAMPLE_BYTES


def test_memory_run_store_save_load_round_trip():
    store = MemoryRunStore()
    store.create_run(RUN_ID, triggered_by="engineer@test")

    artifact = _raw_artifact()
    draft = _draft_contract()
    report = _ingestion_report()

    store.save_artifact(RUN_ID, artifact)
    store.save_drafts(RUN_ID, [draft])
    store.save_report(RUN_ID, report)

    assert store.get_artifact(RUN_ID).artifact_id == ART_ID
    assert store.get_drafts(RUN_ID)[0].draft_id == DRF_ID
    assert store.get_report(RUN_ID).status == "completed"


def test_store_json_extra_fields_are_rejected(tmp_path):
    store = FileRunStore(tmp_path)
    store.create_run(RUN_ID, triggered_by="engineer@test")
    artifact_path = tmp_path / "runs" / RUN_ID / "artifact.json"
    payload = _raw_artifact().model_dump(mode="json")
    payload["unexpected_field"] = "nope"
    artifact_path.write_text(json.dumps(payload), encoding="utf-8")

    with pytest.raises(StoreIntegrityError) as exc_info:
        store.get_artifact(RUN_ID)
    assert isinstance(exc_info.value.__cause__, ValidationError)


def test_settings_has_offline_ingest_data_dir_default(monkeypatch):
    monkeypatch.delenv("OFFLINE_INGEST_DATA_DIR", raising=False)
    settings = Settings()
    assert settings.offline_ingest_data_dir
    assert settings.offline_ingest_data_dir == "./offline-ingest-data"