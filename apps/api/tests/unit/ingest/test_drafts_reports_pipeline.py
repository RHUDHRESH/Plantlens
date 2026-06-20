"""Unit tests for draft builders, report builder, and offline pipeline."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from app.ingest.drafts import (
    build_draft_contracts,
    build_register_map_draft_payload,
    build_tag_draft_payload,
)
from app.ingest.gates import run_gate2_canonical_schema, run_gate3_industrial_truth
from app.ingest.parsers import parse_register_map_records, parse_signal_list_records
from app.ingest.pipeline import run_offline_ingest_cycle
from app.ingest.quarantine import (
    create_quarantine_record,
    quarantine_from_gate_issue,
    quarantine_from_mapping_candidate,
)
from app.ingest.reports import build_ingestion_run_report
from app.ingest.stores import MemoryRawArtifactStore, MemoryRunStore
from app.ingest.mapping import build_unknown_asset_candidate
from app.schemas.ingest.gates import GateIssue, GateReport
from app.schemas.ingest.normalized import NormalizedRecord

from app.schemas.ingest.record import RawRecord, SourceRef

RUN_ID = "run_00000000-0000-4000-8000-000000000001"
RUN_ID_2 = "run_00000000-0000-4000-8000-000000000002"
ART_ID = "art_00000000-0000-4000-8000-000000000001"
SHA256 = "a" * 64
TS = datetime(2026, 6, 20, 12, 0, 0, tzinfo=UTC)
TRIGGERED_BY = "engineer@test"

PHYSICAL_DEMO_CSV = """asset_label,signal_label,tag_hint,unit,side
Solar Charger,Output Voltage,V1,V,dc
Solar Charger,Output Current,I1,A,dc
Solar Charger,Output Power,P1,W,dc
Mains Charger,Output Voltage,V2,V,dc
Mains Charger,Output Current,I2,A,dc
Mains Charger,Output Power,P2,W,dc
24V Lithium Battery,Voltage,V3,V,dc
24V Lithium Battery,Current,I3,A,dc
24V Lithium Battery,Power,P3,W,dc
Inverter,AC Output Voltage,V4,V,ac
Inverter,AC Output Current,I4,A,ac
Inverter,AC Output Power,P4,W,ac
VFD,Motor Feed Voltage,V5,V,ac
VFD,Motor Feed Current,I5,A,ac
VFD,Motor Feed Power,P5,W,ac
FHP 3Phase AC Motor,Speed,N,rpm,mechanical
FHP 3Phase AC Motor,Vibration,Vib,mm/s,mechanical
FHP 3Phase AC Motor,Temperature,Temp,degC,thermal
""".encode()

EXPECTED_PHYSICAL_DEMO_TAGS = {
    "CHG_SOLAR_OUT_V",
    "CHG_SOLAR_OUT_I",
    "CHG_SOLAR_OUT_P",
    "CHG_MAINS_OUT_V",
    "CHG_MAINS_OUT_I",
    "CHG_MAINS_OUT_P",
    "BAT_24V_V",
    "BAT_24V_I",
    "BAT_24V_P",
    "INV_AC_OUT_V",
    "INV_AC_OUT_I",
    "INV_AC_OUT_P",
    "VFD_OUT_V",
    "VFD_OUT_I",
    "VFD_OUT_P",
    "MTR_FHP_SPEED",
    "MTR_FHP_VIB",
    "MTR_FHP_TEMP",
}

PHYSICAL_DEMO_ROWS = [
    ("Solar Charger", "Output Voltage", "V1", "V", "dc", 2),
    ("Solar Charger", "Output Current", "I1", "A", "dc", 3),
    ("Solar Charger", "Output Power", "P1", "W", "dc", 4),
    ("Mains Charger", "Output Voltage", "V2", "V", "dc", 5),
    ("Mains Charger", "Output Current", "I2", "A", "dc", 6),
    ("Mains Charger", "Output Power", "P2", "W", "dc", 7),
    ("24V Lithium Battery", "Voltage", "V3", "V", "dc", 8),
    ("24V Lithium Battery", "Current", "I3", "A", "dc", 9),
    ("24V Lithium Battery", "Power", "P3", "W", "dc", 10),
    ("Inverter", "AC Output Voltage", "V4", "V", "ac", 11),
    ("Inverter", "AC Output Current", "I4", "A", "ac", 12),
    ("Inverter", "AC Output Power", "P4", "W", "ac", 13),
    ("VFD", "Motor Feed Voltage", "V5", "V", "ac", 14),
    ("VFD", "Motor Feed Current", "I5", "A", "ac", 15),
    ("VFD", "Motor Feed Power", "P5", "W", "ac", 16),
    ("FHP 3Phase AC Motor", "Speed", "N", "rpm", "mechanical", 17),
    ("FHP 3Phase AC Motor", "Vibration", "Vib", "mm/s", "mechanical", 18),
    ("FHP 3Phase AC Motor", "Temperature", "Temp", "degC", "thermal", 19),
]


def _source_ref(row_number: int = 2) -> SourceRef:
    return SourceRef(
        artifact_id=ART_ID,
        artifact_sha256=SHA256,
        row_number=row_number,
        column_name="unit",
    )


def _raw_record(*, row_number: int, fields: dict[str, str | None]) -> RawRecord:
    return RawRecord(
        raw_id=f"raw_00000000-0000-4000-8000-{row_number:012d}",
        artifact_id=ART_ID,
        run_id=RUN_ID,
        row_number=row_number,
        fields=fields,
        source_ref=_source_ref(row_number),
        extracted_at_utc=TS,
    )


def _demo_records() -> list[RawRecord]:
    return [
        _raw_record(
            row_number=row_number,
            fields={
                "asset_label": asset_label,
                "signal_label": signal_label,
                "tag_hint": tag_hint,
                "unit": unit,
                "side": side,
            },
        )
        for asset_label, signal_label, tag_hint, unit, side, row_number in PHYSICAL_DEMO_ROWS
    ]


def _clean_physical_demo_records() -> list[NormalizedRecord]:
    normalized, _ = parse_signal_list_records(records=_demo_records())
    _, _, clean = run_gate2_canonical_schema(records=normalized)
    _, _, clean = run_gate3_industrial_truth(records=clean)
    return clean


def _pass_gate_reports() -> list[GateReport]:
    return [
        GateReport(gate_name="artifact_integrity", verdict="pass", accepted=1, rejected=0),
        GateReport(gate_name="canonical_schema", verdict="pass", accepted=18, rejected=0),
        GateReport(gate_name="industrial_truth", verdict="pass", accepted=18, rejected=0),
    ]


def _semantic_pipeline_snapshot(result) -> dict[str, object]:
    return {
        "tag_ids": sorted({draft.payload["tag"]["tag_id"] for draft in result.drafts if draft.draft_type == "tag_draft"}),
        "register_tag_ids": sorted(
            draft.payload["register_map"]["tag_id"]
            for draft in result.drafts
            if draft.draft_type == "register_map_draft"
        ),
        "totals": result.report.totals.model_dump(),
        "status": result.report.status,
        "downstream": result.report.downstream_ready_for_studio,
        "quarantine_reasons": sorted({entry.reason for entry in result.quarantine}),
    }


def test_build_tag_draft_contracts_from_clean_signal_records():
    clean = _clean_physical_demo_records()
    drafts = build_draft_contracts(
        run_id=RUN_ID,
        artifact_id=ART_ID,
        records=clean,
        created_by=TRIGGERED_BY,
    )
    assert len(drafts) == 18
    assert all(draft.requires_human_approval for draft in drafts)
    assert all(draft.status == "pending" for draft in drafts)
    assert all(draft.draft_type == "tag_draft" for draft in drafts)
    assert all(draft.payload["operation"] == "upsert_tag" for draft in drafts)
    assert {draft.payload["tag"]["tag_id"] for draft in drafts} == EXPECTED_PHYSICAL_DEMO_TAGS


def test_draft_builder_skips_quarantined_record():
    clean = _clean_physical_demo_records()[:2]
    quarantine = [
        create_quarantine_record(
            run_id=RUN_ID,
            artifact_id=ART_ID,
            reason="schema_failed",
            severity="HIGH",
            message="Missing unit",
            suggested_fix="Populate the engineering unit.",
            record_id=clean[1].record_id,
        )
    ]
    drafts = build_draft_contracts(
        run_id=RUN_ID,
        artifact_id=ART_ID,
        records=clean,
        quarantine=quarantine,
        created_by=TRIGGERED_BY,
    )
    assert len(drafts) == 1
    assert drafts[0].source_record_ids == [clean[0].record_id]


def test_register_map_draft_payload_contains_register():
    normalized, _ = parse_register_map_records(
        records=[
            _raw_record(
                row_number=2,
                fields={
                    "tag_id": "CHG_SOLAR_OUT_V",
                    "register_address": "40001",
                    "function_code": "03",
                    "data_type": "uint16",
                    "scale": "0.1",
                    "unit": "V",
                    "asset_label": "Solar Charger",
                    "signal_label": "Output Voltage",
                },
            )
        ]
    )
    payload = build_register_map_draft_payload(normalized[0])
    assert payload["operation"] == "upsert_register_map"
    assert payload["register_map"]["register"]["address"] == "40001"
    assert payload["register_map"]["register"]["function_code"] == "3"
    assert payload["register_map"]["register"]["data_type"] == "uint16"


def test_report_builder_completed_clean_run_downstream_ready():
    clean = _clean_physical_demo_records()
    drafts = build_draft_contracts(
        run_id=RUN_ID,
        artifact_id=ART_ID,
        records=clean,
        created_by=TRIGGERED_BY,
    )
    report = build_ingestion_run_report(
        run_id=RUN_ID,
        started_at_utc=TS,
        artifact_ids=[ART_ID],
        detected_document_types=["signal_list"],
        raw_records=_demo_records(),
        normalized_records=clean,
        clean_records=clean,
        mapping_candidates=[],
        gate_reports=_pass_gate_reports(),
        quarantine=[],
        drafts=drafts,
        triggered_by=TRIGGERED_BY,
    )
    assert report.status == "completed"
    assert report.downstream_ready_for_studio is True
    assert report.totals.drafts_created == 18
    assert any(action.action_type == "approve_draft" for action in report.human_actions_needed)


def test_report_builder_partial_when_quarantine_exists():
    quarantine = [
        create_quarantine_record(
            run_id=RUN_ID,
            artifact_id=ART_ID,
            reason="schema_failed",
            severity="HIGH",
            message="Missing unit",
            suggested_fix="Populate the engineering unit.",
        )
    ]
    report = build_ingestion_run_report(
        run_id=RUN_ID,
        started_at_utc=TS,
        artifact_ids=[ART_ID],
        detected_document_types=["signal_list"],
        raw_records=_demo_records(),
        normalized_records=[],
        clean_records=[],
        mapping_candidates=[],
        gate_reports=_pass_gate_reports(),
        quarantine=quarantine,
        drafts=[],
        triggered_by=TRIGGERED_BY,
    )
    assert report.status == "partial"
    assert report.downstream_ready_for_studio is False
    assert any(action.action_type == "review_quarantine" for action in report.human_actions_needed)


def test_report_builder_failed_when_errors_exist():
    report = build_ingestion_run_report(
        run_id=RUN_ID,
        started_at_utc=TS,
        artifact_ids=[ART_ID],
        detected_document_types=["unknown"],
        raw_records=[],
        normalized_records=[],
        clean_records=[],
        mapping_candidates=[],
        gate_reports=[],
        quarantine=[],
        drafts=[],
        triggered_by=TRIGGERED_BY,
        errors=["Unsupported file type"],
    )
    assert report.status == "failed"
    assert report.downstream_ready_for_studio is False


def test_pipeline_csv_physical_demo_happy_path_memory_stores():
    raw_store = MemoryRawArtifactStore()
    run_store = MemoryRunStore()
    result = run_offline_ingest_cycle(
        run_id=RUN_ID,
        content=PHYSICAL_DEMO_CSV,
        source_channel="upload",
        original_filename="physical_demo.csv",
        mime_type="text/csv",
        extension=".csv",
        triggered_by=TRIGGERED_BY,
        raw_store=raw_store,
        run_store=run_store,
    )
    assert result.detection.document_kind == "signal_list"
    assert len(result.raw_records) == 18
    assert len(result.normalized_records) == 18
    assert len(result.clean_records) == 18
    assert len(result.drafts) == 18
    assert result.quarantine == []
    assert result.report.downstream_ready_for_studio is True
    assert result.report.totals.drafts_created == 18
    assert run_store.get_artifact(RUN_ID).artifact_id == result.artifact.artifact_id
    assert len(run_store.get_raw_records(RUN_ID)) == 18
    assert len(run_store.get_normalized_records(RUN_ID)) == 18
    assert len(run_store.get_drafts(RUN_ID)) == 18
    assert run_store.get_report(RUN_ID).status == "completed"


def test_pipeline_csv_missing_unit_partial():
    csv_bytes = PHYSICAL_DEMO_CSV.decode().replace(
        "Solar Charger,Output Voltage,V1,V,dc\n",
        "Solar Charger,Output Voltage,V1,,dc\n",
    ).encode()
    result = run_offline_ingest_cycle(
        run_id=RUN_ID,
        content=csv_bytes,
        source_channel="upload",
        original_filename="missing_unit.csv",
        mime_type="text/csv",
        extension=".csv",
        triggered_by=TRIGGERED_BY,
        raw_store=MemoryRawArtifactStore(),
        run_store=MemoryRunStore(),
    )
    assert result.quarantine
    assert any(
        entry.reason == "schema_failed"
        or "missing_unit" in entry.message.lower()
        or "missing_unit" in entry.raw_snapshot.get("evidence", [])
        for entry in result.quarantine
    )
    assert len(result.drafts) < len(result.raw_records)
    assert result.report.status == "partial"
    assert result.report.downstream_ready_for_studio is False


def test_pipeline_csv_unknown_document_kind_manual_review():
    csv_bytes = b"foo,bar,baz\nalpha,beta,gamma\n"
    result = run_offline_ingest_cycle(
        run_id=RUN_ID,
        content=csv_bytes,
        source_channel="upload",
        original_filename="unknown.csv",
        mime_type="text/csv",
        extension=".csv",
        triggered_by=TRIGGERED_BY,
        raw_store=MemoryRawArtifactStore(),
        run_store=MemoryRunStore(),
    )
    assert result.detection.document_kind == "unknown"
    assert result.quarantine
    assert result.drafts == []
    assert result.report.status in {"partial", "failed"}
    assert result.report.downstream_ready_for_studio is False


def test_pipeline_unsupported_extension_quarantines():
    result = run_offline_ingest_cycle(
        run_id=RUN_ID,
        content=b"%PDF-1.4 fake",
        source_channel="upload",
        original_filename="notes.pdf",
        mime_type="application/pdf",
        extension=".pdf",
        triggered_by=TRIGGERED_BY,
        raw_store=MemoryRawArtifactStore(),
        run_store=MemoryRunStore(),
    )
    assert result.drafts == []
    assert any(entry.reason == "unsupported_file" for entry in result.quarantine)
    assert result.report.status in {"partial", "failed"}
    assert result.report.downstream_ready_for_studio is False


def test_pipeline_duplicate_upload_warns_but_can_still_run():
    raw_store = MemoryRawArtifactStore()
    run_store = MemoryRunStore()
    first = run_offline_ingest_cycle(
        run_id=RUN_ID,
        content=PHYSICAL_DEMO_CSV,
        source_channel="upload",
        original_filename="physical_demo.csv",
        mime_type="text/csv",
        extension=".csv",
        triggered_by=TRIGGERED_BY,
        raw_store=raw_store,
        run_store=run_store,
    )
    second = run_offline_ingest_cycle(
        run_id=RUN_ID_2,
        content=PHYSICAL_DEMO_CSV,
        source_channel="upload",
        original_filename="physical_demo_copy.csv",
        mime_type="text/csv",
        extension=".csv",
        triggered_by=TRIGGERED_BY,
        raw_store=raw_store,
        run_store=run_store,
    )
    assert second.artifact.duplicate_of_artifact_id == first.artifact.artifact_id
    assert any(
        issue.code == "DUPLICATE_ARTIFACT"
        for report in second.gate_reports
        for issue in report.issues
    )


def test_pipeline_register_map_csv_generates_register_draft():
    csv_bytes = (
        "tag_id,register_address,function_code,data_type,scale,unit\n"
        "CHG_SOLAR_OUT_V,40001,03,uint16,0.1,V\n"
    ).encode()
    result = run_offline_ingest_cycle(
        run_id=RUN_ID,
        content=csv_bytes,
        source_channel="upload",
        original_filename="register_map.csv",
        mime_type="text/csv",
        extension=".csv",
        triggered_by=TRIGGERED_BY,
        raw_store=MemoryRawArtifactStore(),
        run_store=MemoryRunStore(),
    )
    assert result.detection.document_kind == "register_map"
    assert len(result.drafts) == 1
    assert result.drafts[0].draft_type == "register_map_draft"
    assert result.report.totals.drafts_created == 1


def test_pipeline_no_runtime_side_effects():
    source = Path("app/ingest/pipeline.py").read_text(encoding="utf-8")
    assert "get_simulator_gateway" not in source
    assert "runtime_state" not in source
    assert "app.routers.ingest" not in source


def test_pipeline_semantic_outputs_are_deterministic():
    first = run_offline_ingest_cycle(
        run_id=RUN_ID,
        content=PHYSICAL_DEMO_CSV,
        source_channel="upload",
        original_filename="physical_demo.csv",
        mime_type="text/csv",
        extension=".csv",
        triggered_by=TRIGGERED_BY,
        raw_store=MemoryRawArtifactStore(),
        run_store=MemoryRunStore(),
    )
    second = run_offline_ingest_cycle(
        run_id=RUN_ID_2,
        content=PHYSICAL_DEMO_CSV,
        source_channel="upload",
        original_filename="physical_demo.csv",
        mime_type="text/csv",
        extension=".csv",
        triggered_by=TRIGGERED_BY,
        raw_store=MemoryRawArtifactStore(),
        run_store=MemoryRunStore(),
    )
    assert _semantic_pipeline_snapshot(first) == _semantic_pipeline_snapshot(second)


def test_quarantine_record_always_has_suggested_fix_from_pipeline_helpers():
    issue = GateIssue(
        code="HASH_MISMATCH",
        message="Stored raw bytes do not match artifact.sha256.",
        severity="BLOCKER",
        fix="Re-read the immutable raw store and verify the artifact hash before continuing.",
    )
    records = [
        quarantine_from_gate_issue(
            run_id=RUN_ID,
            artifact_id=ART_ID,
            issue=issue,
            reason="parse_failed",
            gate_name="artifact_integrity",
        ),
        quarantine_from_mapping_candidate(
            build_unknown_asset_candidate(
                run_id=RUN_ID,
                artifact_id=ART_ID,
                source_record_id="raw_00000000-0000-4000-8000-000000000002",
                raw_value="Mystery Asset",
                source_ref=_source_ref(),
            )
        ),
    ]
    assert all(record.suggested_fix for record in records)


def test_tag_draft_payload_shape():
    clean = _clean_physical_demo_records()[:1]
    payload = build_tag_draft_payload(clean[0])
    assert payload["operation"] == "upsert_tag"
    assert payload["tag"]["tag_id"] == "CHG_SOLAR_OUT_V"
    assert payload["tag"]["source"] == "offline_ingest"