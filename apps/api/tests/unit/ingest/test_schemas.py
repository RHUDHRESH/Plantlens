"""Unit tests for offline ingestion Pydantic schema spine."""

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.schemas.ingest import (
    DraftContract,
    GateReport,
    IngestionRunReport,
    IngestionTotals,
    MappingCandidate,
    NormalizedRecord,
    OfflineDraftsResponse,
    OfflineIngestStartResponse,
    OfflineQuarantineResponse,
    QuarantineRecord,
    RawArtifact,
    RawRecord,
    SourceRef,
)
from app.schemas.ingest.detection import DetectionReport

RUN_ID = "run_00000000-0000-4000-8000-000000000001"
ART_ID = "art_00000000-0000-4000-8000-000000000001"
RAW_ID = "raw_00000000-0000-4000-8000-000000000001"
NRM_ID = "nrm_00000000-0000-4000-8000-000000000001"
MAP_ID = "map_00000000-0000-4000-8000-000000000001"
QRN_ID = "qrn_00000000-0000-4000-8000-000000000001"
DRF_ID = "drf_00000000-0000-4000-8000-000000000001"
SHA256 = "a" * 64
TS = datetime(2026, 6, 20, 12, 0, 0, tzinfo=UTC)


def _source_ref(**overrides: object) -> SourceRef:
    base = {
        "artifact_id": ART_ID,
        "artifact_sha256": SHA256,
        "row_number": 1,
        "column_name": "unit",
    }
    base.update(overrides)
    return SourceRef(**base)  # type: ignore[arg-type]


def test_raw_artifact_rejects_invalid_sha256():
    with pytest.raises(ValidationError) as exc_info:
        RawArtifact(
            artifact_id=ART_ID,
            run_id=RUN_ID,
            received_at_utc=TS,
            size_bytes=10,
            sha256="NOT_A_SHA256",
            source_channel="upload",
            raw_uri="memory://raw/test",
        )
    assert "sha256" in str(exc_info.value)


def test_raw_artifact_accepts_valid_minimal_upload():
    artifact = RawArtifact(
        artifact_id=ART_ID,
        run_id=RUN_ID,
        received_at_utc=TS,
        size_bytes=128,
        sha256=SHA256,
        source_channel="upload",
        raw_uri="memory://raw/abc",
    )
    assert artifact.artifact_id == ART_ID
    assert artifact.detection_confidence == 0.0
    assert artifact.detection_signals == []


def test_source_ref_preserves_locators():
    ref = _source_ref(row_number=3, column_name="signal_label")
    assert ref.row_number == 3
    assert ref.column_name == "signal_label"
    assert ref.artifact_sha256 == SHA256


def test_raw_record_rejects_empty_fields():
    with pytest.raises(ValidationError) as exc_info:
        RawRecord(
            raw_id=RAW_ID,
            artifact_id=ART_ID,
            run_id=RUN_ID,
            row_number=1,
            fields={},
            source_ref=_source_ref(),
            extracted_at_utc=TS,
        )
    assert "fields" in str(exc_info.value)


def test_detection_report_unsupported_requires_reason():
    with pytest.raises(ValidationError) as exc_info:
        DetectionReport(
            artifact_id=ART_ID,
            run_id=RUN_ID,
            document_kind="signal_list",
            confidence=0.2,
            supported=False,
        )
    assert "reason" in str(exc_info.value)


def test_detection_report_unknown_sets_needs_human_label():
    report = DetectionReport(
        artifact_id=ART_ID,
        run_id=RUN_ID,
        document_kind="unknown",
        confidence=0.1,
        supported=True,
    )
    assert report.needs_human_label is True


def test_normalized_record_tag_candidate_requires_fields():
    with pytest.raises(ValidationError) as exc_info:
        NormalizedRecord(
            record_id=NRM_ID,
            run_id=RUN_ID,
            artifact_id=ART_ID,
            raw_id=RAW_ID,
            record_kind="tag_candidate",
            source_ref=_source_ref(),
            confidence=0.9,
        )
    assert "tag_candidate" in str(exc_info.value)


def test_normalized_record_rejects_lowercase_tag_id():
    with pytest.raises(ValidationError) as exc_info:
        NormalizedRecord(
            record_id=NRM_ID,
            run_id=RUN_ID,
            artifact_id=ART_ID,
            raw_id=RAW_ID,
            record_kind="tag_candidate",
            tag_id="chg_solar_out_v",
            asset_id="CHG-SOLAR",
            asset_label="Solar Charger",
            signal_label="Output Voltage",
            unit="V",
            source_ref=_source_ref(),
            confidence=0.9,
        )
    assert "tag_id" in str(exc_info.value)


def test_mapping_candidate_rejects_needs_human_review_false():
    with pytest.raises(ValidationError) as exc_info:
        MappingCandidate(
            mapping_id=MAP_ID,
            run_id=RUN_ID,
            artifact_id=ART_ID,
            source_record_id=NRM_ID,
            target_type="tag",
            issue="UNKNOWN_TAG",
            raw_value="V1",
            source_ref=_source_ref(),
            needs_human_review=False,
        )
    assert "needs_human_review" in str(exc_info.value)


def test_gate_report_fail_requires_issues():
    with pytest.raises(ValidationError) as exc_info:
        GateReport(
            gate_name="canonical_schema",
            verdict="fail",
            accepted=0,
            rejected=1,
            issues=[],
        )
    assert "issues" in str(exc_info.value)


def test_quarantine_record_requires_non_empty_suggested_fix():
    with pytest.raises(ValidationError) as exc_info:
        QuarantineRecord(
            quarantine_id=QRN_ID,
            run_id=RUN_ID,
            artifact_id=ART_ID,
            reason="schema_failed",
            severity="HIGH",
            message="Missing unit",
            suggested_fix="",
            created_at_utc=TS,
        )
    assert "suggested_fix" in str(exc_info.value)


def test_quarantine_record_rejects_needs_human_review_false():
    with pytest.raises(ValidationError) as exc_info:
        QuarantineRecord(
            quarantine_id=QRN_ID,
            run_id=RUN_ID,
            artifact_id=ART_ID,
            reason="schema_failed",
            severity="HIGH",
            message="Missing unit",
            suggested_fix="Add a unit column value",
            created_at_utc=TS,
            needs_human_review=False,
        )
    assert "needs_human_review" in str(exc_info.value)


def test_draft_contract_rejects_requires_human_approval_false():
    with pytest.raises(ValidationError) as exc_info:
        DraftContract(
            draft_id=DRF_ID,
            run_id=RUN_ID,
            draft_type="tag_draft",
            source_artifact_ids=[ART_ID],
            source_record_ids=[NRM_ID],
            payload={"tag_id": "CHG_SOLAR_OUT_V"},
            confidence=0.95,
            created_at_utc=TS,
            created_by="engineer@test",
            requires_human_approval=False,
        )
    assert "requires_human_approval" in str(exc_info.value)


def test_draft_contract_requires_sources_and_payload():
    with pytest.raises(ValidationError):
        DraftContract(
            draft_id=DRF_ID,
            run_id=RUN_ID,
            draft_type="tag_draft",
            source_artifact_ids=[],
            source_record_ids=[NRM_ID],
            payload={"tag_id": "CHG_SOLAR_OUT_V"},
            confidence=0.95,
            created_at_utc=TS,
            created_by="engineer@test",
        )
    with pytest.raises(ValidationError):
        DraftContract(
            draft_id=DRF_ID,
            run_id=RUN_ID,
            draft_type="tag_draft",
            source_artifact_ids=[ART_ID],
            source_record_ids=[],
            payload={"tag_id": "CHG_SOLAR_OUT_V"},
            confidence=0.95,
            created_at_utc=TS,
            created_by="engineer@test",
        )
    with pytest.raises(ValidationError):
        DraftContract(
            draft_id=DRF_ID,
            run_id=RUN_ID,
            draft_type="tag_draft",
            source_artifact_ids=[ART_ID],
            source_record_ids=[NRM_ID],
            payload={},
            confidence=0.95,
            created_at_utc=TS,
            created_by="engineer@test",
        )


def test_ingestion_run_report_rejects_failed_without_errors():
    with pytest.raises(ValidationError) as exc_info:
        IngestionRunReport(
            run_id=RUN_ID,
            started_at_utc=TS,
            status="failed",
            totals=IngestionTotals(
                files_received=1,
                total_records=0,
                parsed_records=0,
                normalized_records=0,
                mapped_records=0,
                drafts_created=0,
                quarantined_records=0,
                manual_review_count=0,
            ),
            triggered_by="engineer@test",
            errors=[],
        )
    assert "errors" in str(exc_info.value)


def test_ingestion_run_report_rejects_completed_before_started():
    with pytest.raises(ValidationError) as exc_info:
        IngestionRunReport(
            run_id=RUN_ID,
            started_at_utc=TS,
            completed_at_utc=datetime(2026, 6, 20, 11, 0, 0, tzinfo=UTC),
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
    assert "completed_at_utc" in str(exc_info.value)


def test_api_response_wrappers_validate_happy_path():
    start = OfflineIngestStartResponse(
        run_id=RUN_ID,
        artifact_id=ART_ID,
        status="running",
        document_kind="signal_list",
    )
    assert start.status == "running"

    draft = DraftContract(
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
    drafts_response = OfflineDraftsResponse(drafts=[draft])
    assert len(drafts_response.drafts) == 1

    quarantine = QuarantineRecord(
        quarantine_id=QRN_ID,
        run_id=RUN_ID,
        artifact_id=ART_ID,
        reason="schema_failed",
        severity="HIGH",
        message="Missing unit",
        suggested_fix="Populate the unit column",
        created_at_utc=TS,
    )
    quarantine_response = OfflineQuarantineResponse(quarantine=[quarantine])
    assert quarantine_response.quarantine[0].quarantine_id == QRN_ID