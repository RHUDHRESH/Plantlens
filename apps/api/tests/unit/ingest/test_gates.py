"""Unit tests for offline ingestion gates and quarantine helpers."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime

from app.ingest.gates import (
    run_gate1_artifact_integrity,
    run_gate2_canonical_schema,
    run_gate3_industrial_truth,
)
from app.ingest.mapping import build_unknown_asset_candidate
from app.ingest.parsers import parse_register_map_records, parse_signal_list_records
from app.ingest.quarantine import (
    create_quarantine_record,
    quarantine_from_gate_issue,
    quarantine_from_mapping_candidate,
)
from app.schemas.ingest.artifact import RawArtifact
from app.schemas.ingest.gates import GateIssue
from app.schemas.ingest.normalized import NormalizedRecord
from app.schemas.ingest.record import RawRecord, SourceRef

RUN_ID = "run_00000000-0000-4000-8000-000000000001"
ART_ID = "art_00000000-0000-4000-8000-000000000001"
OTHER_ART_ID = "art_00000000-0000-4000-8000-000000000002"
SHA256 = "a" * 64
TS = datetime(2026, 6, 20, 12, 0, 0, tzinfo=UTC)

PHYSICAL_DEMO_ROWS = [
    ("Solar Charger", "Output Voltage", "V1", "V", "dc", 2, "CHG_SOLAR_OUT_V"),
    ("Solar Charger", "Output Current", "I1", "A", "dc", 3, "CHG_SOLAR_OUT_I"),
    ("Solar Charger", "Output Power", "P1", "W", "dc", 4, "CHG_SOLAR_OUT_P"),
    ("Mains Charger", "Output Voltage", "V2", "V", "dc", 5, "CHG_MAINS_OUT_V"),
    ("Mains Charger", "Output Current", "I2", "A", "dc", 6, "CHG_MAINS_OUT_I"),
    ("Mains Charger", "Output Power", "P2", "W", "dc", 7, "CHG_MAINS_OUT_P"),
    ("24V Lithium Battery", "Voltage", "V3", "V", "dc", 8, "BAT_24V_V"),
    ("24V Lithium Battery", "Current", "I3", "A", "dc", 9, "BAT_24V_I"),
    ("24V Lithium Battery", "Power", "P3", "W", "dc", 10, "BAT_24V_P"),
    ("Inverter", "AC Output Voltage", "V4", "V", "ac", 11, "INV_AC_OUT_V"),
    ("Inverter", "AC Output Current", "I4", "A", "ac", 12, "INV_AC_OUT_I"),
    ("Inverter", "AC Output Power", "P4", "W", "ac", 13, "INV_AC_OUT_P"),
    ("VFD", "Motor Feed Voltage", "V5", "V", "ac", 14, "VFD_OUT_V"),
    ("VFD", "Motor Feed Current", "I5", "A", "ac", 15, "VFD_OUT_I"),
    ("VFD", "Motor Feed Power", "P5", "W", "ac", 16, "VFD_OUT_P"),
    ("FHP 3Phase AC Motor", "Speed", "N", "rpm", "mechanical", 17, "MTR_FHP_SPEED"),
    ("FHP 3Phase AC Motor", "Vibration", "Vib", "mm/s", "mechanical", 18, "MTR_FHP_VIB"),
    ("FHP 3Phase AC Motor", "Temperature", "Temp", "degC", "thermal", 19, "MTR_FHP_TEMP"),
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
        for asset_label, signal_label, tag_hint, unit, side, row_number, _ in PHYSICAL_DEMO_ROWS
    ]


def _artifact(*, sha256: str = SHA256, size_bytes: int = 10, **overrides: object) -> RawArtifact:
    base = {
        "artifact_id": ART_ID,
        "run_id": RUN_ID,
        "received_at_utc": TS,
        "size_bytes": size_bytes,
        "sha256": sha256,
        "source_channel": "upload",
        "raw_uri": "memory://raw/demo",
        "document_kind": "signal_list",
    }
    base.update(overrides)
    return RawArtifact(**base)  # type: ignore[arg-type]


def _gate_semantic_snapshot(report, quarantine, clean=None) -> dict[str, object]:
    return {
        "gate": report.gate_name,
        "verdict": report.verdict,
        "accepted": report.accepted,
        "rejected": report.rejected,
        "issues": [(issue.code, issue.severity) for issue in report.issues],
        "quarantine": [
            (record.reason, record.severity, record.message, record.suggested_fix)
            for record in quarantine
        ],
        "clean_ids": [record.record_id for record in (clean or [])],
    }


def test_gate1_passes_valid_artifact_and_records():
    raw_bytes = b"physical-demo"
    sha256 = hashlib.sha256(raw_bytes).hexdigest()
    artifact = _artifact(sha256=sha256, size_bytes=len(raw_bytes))
    raw_records = [
        _demo_records()[0].model_copy(
            update={
                "source_ref": _source_ref(2).model_copy(update={"artifact_sha256": sha256}),
            }
        )
    ]
    report, quarantine = run_gate1_artifact_integrity(
        artifact=artifact,
        raw_bytes=raw_bytes,
        raw_records=raw_records,
    )
    assert report.verdict == "pass"
    assert report.issues == []
    assert quarantine == []


def test_gate1_detects_hash_mismatch():
    raw_bytes = b"mismatched-bytes"
    artifact = _artifact(sha256=SHA256, size_bytes=len(raw_bytes))
    report, quarantine = run_gate1_artifact_integrity(
        artifact=artifact,
        raw_bytes=raw_bytes,
    )
    assert report.verdict == "fail"
    assert any(issue.code == "HASH_MISMATCH" for issue in report.issues)
    assert quarantine
    assert quarantine[0].reason in {"parse_failed", "schema_failed"}


def test_gate1_warns_duplicate_artifact():
    artifact = _artifact(duplicate_of_artifact_id=OTHER_ART_ID)
    report, quarantine = run_gate1_artifact_integrity(artifact=artifact)
    assert report.verdict == "warn"
    assert any(issue.code == "DUPLICATE_ARTIFACT" for issue in report.issues)
    assert quarantine == []


def test_gate1_detects_raw_record_artifact_mismatch():
    artifact = _artifact()
    bad_record = _raw_record(
        row_number=2,
        fields={
            "asset_label": "Solar Charger",
            "signal_label": "Output Voltage",
            "tag_hint": "V1",
            "unit": "V",
            "side": "dc",
        },
    ).model_copy(update={"artifact_id": OTHER_ART_ID})
    report, quarantine = run_gate1_artifact_integrity(
        artifact=artifact,
        raw_records=[bad_record],
    )
    assert report.verdict == "fail"
    assert any(issue.code == "RAW_RECORD_ARTIFACT_MISMATCH" for issue in report.issues)
    assert quarantine


def test_gate2_passes_clean_signal_list_records():
    normalized, _ = parse_signal_list_records(records=_demo_records())
    report, quarantine, clean = run_gate2_canonical_schema(records=normalized)
    assert report.verdict == "pass"
    assert len(clean) == 18
    assert quarantine == []


def test_gate2_rejects_missing_unit():
    record = NormalizedRecord.model_construct(
        record_id="nrm_00000000-0000-4000-8000-000000000001",
        run_id=RUN_ID,
        artifact_id=ART_ID,
        raw_id="raw_00000000-0000-4000-8000-000000000002",
        record_kind="tag_candidate",
        tag_id="CHG_SOLAR_OUT_V",
        asset_id="CHG-SOLAR",
        asset_label="Solar Charger",
        signal_label="Output Voltage",
        unit=None,
        side="dc",
        source_ref=_source_ref(),
        confidence=0.9,
        fields={"unit": None},
    )
    report, quarantine, clean = run_gate2_canonical_schema(records=[record])
    assert any(issue.code == "MISSING_UNIT" for issue in report.issues)
    assert quarantine
    assert quarantine[0].suggested_fix
    assert clean == []


def test_gate2_rejects_invalid_tag_id():
    record = NormalizedRecord.model_construct(
        record_id="nrm_00000000-0000-4000-8000-000000000001",
        run_id=RUN_ID,
        artifact_id=ART_ID,
        raw_id="raw_00000000-0000-4000-8000-000000000002",
        record_kind="tag_candidate",
        tag_id="bad-tag",
        asset_id="CHG-SOLAR",
        asset_label="Solar Charger",
        signal_label="Output Voltage",
        unit="V",
        side="dc",
        source_ref=_source_ref(),
        confidence=0.9,
        fields={},
    )
    report, quarantine, _ = run_gate2_canonical_schema(records=[record])
    assert any(issue.code == "INVALID_TAG_ID" for issue in report.issues)
    assert quarantine


def test_gate2_warns_unknown_side():
    record = NormalizedRecord.model_construct(
        record_id="nrm_00000000-0000-4000-8000-000000000001",
        run_id=RUN_ID,
        artifact_id=ART_ID,
        raw_id="raw_00000000-0000-4000-8000-000000000002",
        record_kind="tag_candidate",
        tag_id="CHG_SOLAR_OUT_V",
        asset_id="CHG-SOLAR",
        asset_label="Solar Charger",
        signal_label="Output Voltage",
        unit="V",
        side="unknown",
        source_ref=_source_ref(),
        confidence=0.9,
        fields={},
    )
    report, quarantine, clean = run_gate2_canonical_schema(records=[record])
    assert any(issue.code == "UNKNOWN_SIDE" for issue in report.issues)
    assert quarantine == []
    assert len(clean) == 1


def test_gate2_register_map_requires_register_fields():
    record = NormalizedRecord.model_construct(
        record_id="nrm_00000000-0000-4000-8000-000000000001",
        run_id=RUN_ID,
        artifact_id=ART_ID,
        raw_id="raw_00000000-0000-4000-8000-000000000002",
        record_kind="register_map_candidate",
        tag_id="CHG_SOLAR_OUT_V",
        register={},
        source_ref=_source_ref(),
        confidence=0.9,
        fields={},
    )
    report, quarantine, clean = run_gate2_canonical_schema(records=[record])
    codes = {issue.code for issue in report.issues}
    assert "MISSING_REGISTER_ADDRESS" in codes
    assert "MISSING_FUNCTION_CODE" in codes
    assert "MISSING_DATA_TYPE" in codes
    assert quarantine
    assert clean == []


def test_gate3_passes_clean_physical_demo_signal_list():
    normalized, _ = parse_signal_list_records(records=_demo_records())
    report, quarantine, clean = run_gate3_industrial_truth(records=normalized)
    assert report.verdict == "pass"
    assert len(clean) == 18
    assert quarantine == []


def test_gate3_quarantines_duplicate_tag_id():
    normalized, _ = parse_signal_list_records(records=_demo_records()[:1])
    duplicate = normalized[0].model_copy(
        update={
            "record_id": "nrm_00000000-0000-4000-8000-000000009999",
            "raw_id": "raw_00000000-0000-4000-8000-000000009999",
        }
    )
    records = [normalized[0], duplicate]
    report, quarantine, clean = run_gate3_industrial_truth(records=records)
    assert any(issue.code == "DUPLICATE_TAG_ID" for issue in report.issues)
    assert any(record.reason == "duplicate_conflict" for record in quarantine)
    assert len(clean) == 1


def test_gate3_quarantines_unit_signal_mismatch():
    record = NormalizedRecord.model_construct(
        record_id="nrm_00000000-0000-4000-8000-000000000001",
        run_id=RUN_ID,
        artifact_id=ART_ID,
        raw_id="raw_00000000-0000-4000-8000-000000000002",
        record_kind="tag_candidate",
        tag_id="MTR_FHP_VIB",
        asset_id="MTR-FHP",
        asset_label="FHP 3Phase AC Motor",
        signal_label="Vibration",
        unit="V",
        side="mechanical",
        signal_type="vibration",
        source_ref=_source_ref(),
        confidence=0.9,
        fields={},
    )
    report, quarantine, clean = run_gate3_industrial_truth(records=[record])
    assert any(issue.code == "UNIT_SIGNAL_MISMATCH" for issue in report.issues)
    assert any(record.reason == "industrial_truth_failed" for record in quarantine)
    assert clean == []


def test_gate3_quarantines_side_mismatch_for_battery():
    record = NormalizedRecord.model_construct(
        record_id="nrm_00000000-0000-4000-8000-000000000001",
        run_id=RUN_ID,
        artifact_id=ART_ID,
        raw_id="raw_00000000-0000-4000-8000-000000000002",
        record_kind="tag_candidate",
        tag_id="BAT_24V_V",
        asset_id="BAT-24V",
        asset_label="24V Lithium Battery",
        signal_label="Voltage",
        unit="V",
        side="ac",
        signal_type="voltage",
        source_ref=_source_ref(),
        confidence=0.9,
        fields={},
    )
    report, quarantine, clean = run_gate3_industrial_truth(records=[record])
    assert any(issue.code == "SIDE_MISMATCH" for issue in report.issues)
    assert quarantine
    assert clean == []


def test_gate3_mapping_candidate_creates_manual_review_quarantine():
    candidate = build_unknown_asset_candidate(
        run_id=RUN_ID,
        artifact_id=ART_ID,
        source_record_id="raw_00000000-0000-4000-8000-000000000002",
        raw_value="Mystery Asset",
        source_ref=_source_ref(),
    )
    report, quarantine, clean = run_gate3_industrial_truth(
        records=[],
        mapping_candidates=[candidate],
    )
    assert any(issue.code == "MANUAL_REVIEW_REQUIRED" for issue in report.issues)
    assert quarantine
    assert quarantine[0].reason in {"ambiguous_mapping", "manual_review_required"}
    assert quarantine[0].suggested_fix
    assert clean == []


def test_gate3_register_invalid_function_code():
    normalized, _ = parse_register_map_records(
        records=[
            _raw_record(
                row_number=2,
                fields={
                    "tag_id": "CHG_SOLAR_OUT_V",
                    "register_address": "40001",
                    "function_code": "99",
                    "data_type": "uint16",
                    "unit": "V",
                },
            )
        ]
    )
    record = normalized[0].model_copy(update={"register": {**normalized[0].register, "function_code": "99"}})
    report, quarantine, clean = run_gate3_industrial_truth(records=[record])
    assert any(issue.code == "INVALID_FUNCTION_CODE" for issue in report.issues)
    assert quarantine
    assert clean == []


def test_gate3_register_bool_with_voltage_unit_warns_or_quarantines():
    record = NormalizedRecord.model_construct(
        record_id="nrm_00000000-0000-4000-8000-000000000001",
        run_id=RUN_ID,
        artifact_id=ART_ID,
        raw_id="raw_00000000-0000-4000-8000-000000000002",
        record_kind="register_map_candidate",
        tag_id="CHG_SOLAR_OUT_V",
        register={"address": "1", "function_code": "1", "data_type": "bool"},
        unit="V",
        source_ref=_source_ref(),
        confidence=0.9,
        fields={},
    )
    report, quarantine, _ = run_gate3_industrial_truth(records=[record])
    assert any(issue.code == "REGISTER_TYPE_UNIT_MISMATCH" for issue in report.issues)
    assert quarantine


def test_quarantine_from_mapping_candidate_preserves_source_ref():
    source_ref = _source_ref(5)
    candidate = build_unknown_asset_candidate(
        run_id=RUN_ID,
        artifact_id=ART_ID,
        source_record_id="raw_00000000-0000-4000-8000-000000000005",
        raw_value="Mystery Asset",
        source_ref=source_ref,
    )
    quarantine = quarantine_from_mapping_candidate(candidate)
    assert quarantine.source_ref == source_ref


def test_quarantine_record_always_has_suggested_fix():
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
        create_quarantine_record(
            run_id=RUN_ID,
            artifact_id=ART_ID,
            reason="schema_failed",
            severity="HIGH",
            message="Missing unit",
            suggested_fix="Populate the engineering unit for this signal.",
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


def test_gate_outputs_are_deterministic_semantically():
    normalized, mappings = parse_signal_list_records(records=_demo_records())
    gate2_first = run_gate2_canonical_schema(records=normalized)
    gate2_second = run_gate2_canonical_schema(records=normalized)
    assert _gate_semantic_snapshot(*gate2_first[:2], gate2_first[2]) == _gate_semantic_snapshot(
        *gate2_second[:2], gate2_second[2]
    )

    gate3_first = run_gate3_industrial_truth(records=normalized, mapping_candidates=mappings)
    gate3_second = run_gate3_industrial_truth(records=normalized, mapping_candidates=mappings)
    assert _gate_semantic_snapshot(*gate3_first[:2], gate3_first[2]) == _gate_semantic_snapshot(
        *gate3_second[:2], gate3_second[2]
    )

    raw_bytes = b"physical-demo"
    sha256 = hashlib.sha256(raw_bytes).hexdigest()
    artifact = _artifact(sha256=sha256, size_bytes=len(raw_bytes))
    raw_records = [
        _demo_records()[0].model_copy(
            update={
                "source_ref": _source_ref(2).model_copy(update={"artifact_sha256": sha256}),
            }
        )
    ]
    gate1_first = run_gate1_artifact_integrity(
        artifact=artifact,
        raw_bytes=raw_bytes,
        raw_records=raw_records,
    )
    gate1_second = run_gate1_artifact_integrity(
        artifact=artifact,
        raw_bytes=raw_bytes,
        raw_records=raw_records,
    )
    assert _gate_semantic_snapshot(*gate1_first) == _gate_semantic_snapshot(*gate1_second)