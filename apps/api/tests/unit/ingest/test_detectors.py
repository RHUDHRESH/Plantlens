"""Unit tests for offline ingestion document-kind and CSV dialect detectors."""

from __future__ import annotations

from datetime import UTC, datetime

from app.ingest.detectors import (
    detect_document_kind,
    detect_header_row,
    extract_headers_from_records,
    normalize_header_row,
    score_document_kinds,
    sniff_csv_dialect,
)
from app.schemas.ingest.artifact import RawArtifact
from app.schemas.ingest.record import RawRecord, SourceRef

RUN_ID = "run_00000000-0000-4000-8000-000000000001"
ART_ID = "art_00000000-0000-4000-8000-000000000001"
RAW_ID = "raw_00000000-0000-4000-8000-000000000001"
SHA256 = "a" * 64
TS = datetime(2026, 6, 20, 12, 0, 0, tzinfo=UTC)


def _artifact(**overrides: object) -> RawArtifact:
    base = {
        "artifact_id": ART_ID,
        "run_id": RUN_ID,
        "received_at_utc": TS,
        "size_bytes": 0,
        "sha256": SHA256,
        "source_channel": "upload",
        "raw_uri": "memory://raw/test",
    }
    base.update(overrides)
    return RawArtifact(**base)  # type: ignore[arg-type]


def _source_ref() -> SourceRef:
    return SourceRef(
        artifact_id=ART_ID,
        artifact_sha256=SHA256,
        row_number=1,
        column_name="unit",
    )


def _raw_record(**field_overrides: str) -> RawRecord:
    fields = {
        "asset_label": "Solar Charger",
        "signal_label": "Output Voltage",
        "unit": "V",
    }
    fields.update(field_overrides)
    return RawRecord(
        raw_id=RAW_ID,
        artifact_id=ART_ID,
        run_id=RUN_ID,
        row_number=1,
        fields=fields,
        source_ref=_source_ref(),
        extracted_at_utc=TS,
    )


def test_extract_headers_from_records_returns_cleaned_headers():
    headers = extract_headers_from_records([_raw_record()])
    assert "asset_label" in headers
    assert "signal_label" in headers
    assert "unit" in headers


def test_detect_signal_list_from_demo_headers():
    report = detect_document_kind(
        artifact=_artifact(),
        headers=["asset_label", "signal_label", "tag_hint", "unit", "side"],
    )
    assert report.document_kind == "signal_list"
    assert report.confidence >= 0.9
    assert report.supported is True
    assert "header:asset_label" in report.signals
    assert "header:signal_label" in report.signals
    assert "header:unit" in report.signals


def test_detect_register_map_from_headers():
    report = detect_document_kind(
        artifact=_artifact(),
        headers=["tag_id", "register_address", "function_code", "data_type", "scale", "unit"],
    )
    assert report.document_kind == "register_map"
    assert report.confidence >= 0.8
    assert report.supported is True


def test_detect_alarm_history_from_headers():
    report = detect_document_kind(
        artifact=_artifact(),
        headers=["timestamp", "alarm_name", "severity", "active", "source"],
    )
    assert report.document_kind == "alarm_history"
    assert report.confidence >= 0.8


def test_detect_cause_effect_matrix_from_headers():
    report = detect_document_kind(
        artifact=_artifact(),
        headers=["cause", "effect", "action", "interlock", "trip"],
    )
    assert report.document_kind == "cause_effect_matrix"
    assert report.confidence >= 0.9


def test_detect_operator_note_from_text():
    report = detect_document_kind(
        artifact=_artifact(),
        text=(
            "Operator noticed abnormal vibration near the motor after startup. "
            "Maintenance checked coupling."
        ),
    )
    assert report.document_kind == "operator_note"
    assert report.confidence >= 0.6
    assert any(signal.startswith("text:") or signal.startswith("term:") for signal in report.signals)


def test_unknown_when_no_confident_match():
    report = detect_document_kind(
        artifact=_artifact(),
        headers=["foo", "bar", "baz"],
    )
    assert report.document_kind == "unknown"
    assert report.supported is False
    assert report.needs_human_label is True
    assert report.reason


def test_ambiguous_signal_list_vs_register_map_requires_human_label():
    report = detect_document_kind(
        artifact=_artifact(),
        headers=[
            "asset_label",
            "signal_label",
            "tag_id",
            "register_address",
            "unit",
            "data_type",
        ],
    )
    assert report.document_kind == "unknown"
    assert report.supported is False
    assert report.needs_human_label is True
    assert "Ambiguous" in (report.reason or "")


def test_detection_report_uses_artifact_identity():
    artifact = _artifact()
    report = detect_document_kind(
        artifact=artifact,
        headers=["asset_label", "signal_label", "unit"],
    )
    assert report.artifact_id == ART_ID
    assert report.run_id == RUN_ID


def test_score_document_kinds_returns_explanation_signals():
    scores = score_document_kinds(
        headers=["asset_label", "signal_label", "tag_hint", "unit", "side"],
    )
    signal_score, signal_signals = scores["signal_list"]
    assert signal_score >= 0.9
    assert "header:asset_label" in signal_signals
    assert "matched:signal_list" in signal_signals


def test_sniff_csv_dialect_comma():
    report = sniff_csv_dialect(b"a,b,c\n1,2,3\n")
    assert report.delimiter == ","
    assert report.confidence > 0


def test_sniff_csv_dialect_semicolon():
    report = sniff_csv_dialect(b"a;b;c\n1;2;3\n")
    assert report.delimiter == ";"


def test_detect_header_row_skips_empty_rows():
    rows = [
        [],
        ["", ""],
        ["asset_label", "signal_label"],
        ["Solar Charger", "Voltage"],
    ]
    assert detect_header_row(rows) == 2


def test_normalize_header_row_uses_clean_header():
    assert normalize_header_row([" Asset Label ", "Tag/Hint"]) == ["asset_label", "tag_hint"]


def test_detectors_do_not_mutate_raw_records():
    record = _raw_record()
    original_fields = dict(record.fields)
    detect_document_kind(artifact=_artifact(), records=[record])
    assert record.fields == original_fields