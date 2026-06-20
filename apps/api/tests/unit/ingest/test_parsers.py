"""Unit tests for offline ingestion signal/register parsers and mapping helpers."""

from __future__ import annotations

from datetime import UTC, datetime

from app.ingest.mapping import (
    build_ambiguous_signal_candidate,
    build_duplicate_tag_candidate,
    build_unknown_asset_candidate,
    build_unknown_tag_candidate,
    simple_similarity,
)
from app.ingest.parsers import parse_register_map_records, parse_signal_list_records
from app.schemas.ingest.record import RawRecord, SourceRef

RUN_ID = "run_00000000-0000-4000-8000-000000000001"
ART_ID = "art_00000000-0000-4000-8000-000000000001"
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

EXPECTED_PHYSICAL_DEMO_TAGS = {row[6] for row in PHYSICAL_DEMO_ROWS}


def _source_ref(row_number: int) -> SourceRef:
    return SourceRef(
        artifact_id=ART_ID,
        artifact_sha256=SHA256,
        row_number=row_number,
        column_name="unit",
    )


def _raw_record(
    *,
    row_number: int,
    fields: dict[str, str | None],
) -> RawRecord:
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


def _semantic_snapshot(
    normalized: list,
    mappings: list,
) -> list[dict[str, object]]:
    return [
        {
            "tag_id": record.tag_id,
            "asset_id": record.asset_id,
            "unit": record.unit,
            "register": record.register,
            "warnings": record.warnings,
            "signal_type": record.signal_type,
            "side": record.side,
        }
        for record in normalized
    ] + [
        {
            "issue": candidate.issue,
            "raw_value": candidate.raw_value,
            "evidence": candidate.evidence,
            "conflicts": candidate.conflicts,
        }
        for candidate in mappings
    ]


def test_parse_signal_list_generates_18_physical_demo_normalized_records():
    normalized, mappings = parse_signal_list_records(records=_demo_records())
    assert len(normalized) == 18
    assert mappings == []
    assert {record.tag_id for record in normalized} == EXPECTED_PHYSICAL_DEMO_TAGS


def test_signal_list_parser_preserves_source_refs():
    raw_records = _demo_records()
    normalized, _ = parse_signal_list_records(records=raw_records)
    raw_by_id = {record.raw_id: record for record in raw_records}
    for record in normalized:
        raw = raw_by_id[record.raw_id]
        assert record.source_ref.artifact_id == ART_ID
        assert record.source_ref.artifact_sha256 == SHA256
        assert record.source_ref.row_number == raw.row_number


def test_signal_list_parser_infers_signal_types():
    normalized, _ = parse_signal_list_records(records=_demo_records())
    by_tag = {record.tag_id: record for record in normalized}
    assert by_tag["CHG_SOLAR_OUT_V"].signal_type == "voltage"
    assert by_tag["CHG_SOLAR_OUT_I"].signal_type == "current"
    assert by_tag["CHG_SOLAR_OUT_P"].signal_type == "power"
    assert by_tag["MTR_FHP_SPEED"].signal_type == "speed"
    assert by_tag["MTR_FHP_VIB"].signal_type == "vibration"
    assert by_tag["MTR_FHP_TEMP"].signal_type == "temperature"


def test_signal_list_parser_normalizes_side_values():
    normalized, _ = parse_signal_list_records(records=_demo_records())
    by_tag = {record.tag_id: record for record in normalized}
    assert by_tag["CHG_SOLAR_OUT_V"].side == "dc"
    assert by_tag["INV_AC_OUT_V"].side == "ac"
    assert by_tag["MTR_FHP_SPEED"].side == "mechanical"
    assert by_tag["MTR_FHP_TEMP"].side == "thermal"

    direct_current, _ = parse_signal_list_records(
        records=[
            _raw_record(
                row_number=2,
                fields={
                    "asset_label": "Solar Charger",
                    "signal_label": "Output Voltage",
                    "tag_hint": "V1",
                    "unit": "V",
                    "side": "Direct Current",
                },
            )
        ]
    )
    assert direct_current[0].side == "dc"


def test_signal_list_unknown_asset_creates_mapping_candidate():
    normalized, mappings = parse_signal_list_records(
        records=[
            _raw_record(
                row_number=2,
                fields={
                    "asset_label": "Random Pump 7",
                    "signal_label": "Flow Rate",
                    "tag_hint": "FR1",
                    "unit": "L/min",
                    "side": "mechanical",
                },
            )
        ]
    )
    assert len(normalized) == 1
    assert any(candidate.issue == "UNKNOWN_ASSET" for candidate in mappings)
    assert all(candidate.needs_human_review for candidate in mappings)


def test_signal_list_fallback_tag_creates_unknown_tag_candidate():
    normalized, mappings = parse_signal_list_records(
        records=[
            _raw_record(
                row_number=2,
                fields={
                    "asset_label": "Random Pump 7",
                    "signal_label": "Flow Rate",
                    "tag_hint": "FR1",
                    "unit": "L/min",
                    "side": "mechanical",
                },
            )
        ]
    )
    assert normalized[0].tag_id == "RANDOM_PUMP_7_FLOW_RATE"
    assert any(candidate.issue == "UNKNOWN_TAG" for candidate in mappings)


def test_signal_list_fallback_tag_creates_ambiguous_signal_with_known_tags():
    _, mappings = parse_signal_list_records(
        records=[
            _raw_record(
                row_number=2,
                fields={
                    "asset_label": "Random Pump 7",
                    "signal_label": "Output Voltage",
                    "tag_hint": "V9",
                    "unit": "V",
                    "side": "dc",
                },
            )
        ],
        known_tags={"CHG_SOLAR_OUT_V": "Solar Charger Output Voltage"},
    )
    assert any(candidate.issue == "AMBIGUOUS_SIGNAL" for candidate in mappings)


def test_signal_list_duplicate_tag_creates_duplicate_mapping_candidate():
    normalized, mappings = parse_signal_list_records(
        records=[
            _raw_record(
                row_number=2,
                fields={
                    "asset_label": "Solar Charger",
                    "signal_label": "Output Voltage",
                    "tag_hint": "V1",
                    "unit": "V",
                    "side": "dc",
                },
            ),
            _raw_record(
                row_number=3,
                fields={
                    "asset_label": "Solar Charger",
                    "signal_label": "Output Voltage",
                    "tag_hint": "V1",
                    "unit": "V",
                    "side": "dc",
                },
            ),
        ]
    )
    assert len(normalized) == 2
    duplicate = [candidate for candidate in mappings if candidate.issue == "DUPLICATE_TAG"]
    assert len(duplicate) == 1
    assert duplicate[0].raw_value == "CHG_SOLAR_OUT_V"
    assert duplicate[0].conflicts


def test_signal_list_missing_unit_keeps_warning_not_quarantine():
    normalized, mappings = parse_signal_list_records(
        records=[
            _raw_record(
                row_number=2,
                fields={
                    "asset_label": "Solar Charger",
                    "signal_label": "Output Voltage",
                    "tag_hint": "V1",
                    "unit": None,
                    "side": "dc",
                },
            )
        ]
    )
    assert normalized == []
    assert any("missing_unit" in candidate.evidence for candidate in mappings)


def test_parse_register_map_creates_register_map_candidate():
    normalized, mappings = parse_register_map_records(
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
    assert len(normalized) == 1
    assert mappings == []
    record = normalized[0]
    assert record.record_kind == "register_map_candidate"
    assert record.register == {
        "address": "40001",
        "function_code": "3",
        "data_type": "uint16",
        "scale": "0.1",
    }
    assert record.tag_id == "CHG_SOLAR_OUT_V"


def test_register_map_parser_generates_tag_when_missing_explicit_tag():
    normalized, _ = parse_register_map_records(
        records=[
            _raw_record(
                row_number=2,
                fields={
                    "asset_label": "Solar Charger",
                    "signal_label": "Output Voltage",
                    "unit": "V",
                    "register_address": "40001",
                    "function_code": "03",
                    "data_type": "uint16",
                },
            )
        ]
    )
    assert normalized[0].tag_id == "CHG_SOLAR_OUT_V"


def test_register_map_invalid_register_warns():
    normalized, _ = parse_register_map_records(
        records=[
            _raw_record(
                row_number=2,
                fields={
                    "tag_id": "CHG_SOLAR_OUT_V",
                    "register_address": "abc",
                    "function_code": "03",
                    "data_type": "uint16",
                    "unit": "V",
                },
            )
        ]
    )
    assert "invalid_register_address" in normalized[0].warnings


def test_register_map_duplicate_tag_mapping_candidate():
    normalized, mappings = parse_register_map_records(
        records=[
            _raw_record(
                row_number=2,
                fields={
                    "tag_id": "CHG_SOLAR_OUT_V",
                    "register_address": "40001",
                    "function_code": "03",
                    "data_type": "uint16",
                    "unit": "V",
                },
            ),
            _raw_record(
                row_number=3,
                fields={
                    "tag_id": "CHG_SOLAR_OUT_V",
                    "register_address": "40002",
                    "function_code": "03",
                    "data_type": "uint16",
                    "unit": "V",
                },
            ),
        ]
    )
    assert len(normalized) == 2
    assert any(candidate.issue == "DUPLICATE_TAG" for candidate in mappings)


def test_mapping_similarity_exact_and_token_overlap():
    assert simple_similarity("Solar Charger", "solar charger") == 1.0
    assert simple_similarity("Solar MPPT Charger", "Solar Charger") > simple_similarity(
        "Pump", "Solar Charger"
    )


def test_unknown_asset_candidate_ranks_known_asset_suggestions():
    candidate = build_unknown_asset_candidate(
        run_id=RUN_ID,
        artifact_id=ART_ID,
        source_record_id="raw_00000000-0000-4000-8000-000000000002",
        raw_value="Solar MPPT Charger",
        source_ref=_source_ref(2),
        known_assets={"CHG-SOLAR": "Solar Charger", "MTR-FHP": "FHP Motor"},
    )
    assert candidate.suggested_matches[0].target_id == "CHG-SOLAR"


def test_mapping_candidates_always_need_human_review():
    source_ref = _source_ref(2)
    candidates = [
        build_unknown_asset_candidate(
            run_id=RUN_ID,
            artifact_id=ART_ID,
            source_record_id="raw_00000000-0000-4000-8000-000000000002",
            raw_value="Solar MPPT Charger",
            source_ref=source_ref,
        ),
        build_unknown_tag_candidate(
            run_id=RUN_ID,
            artifact_id=ART_ID,
            source_record_id="raw_00000000-0000-4000-8000-000000000002",
            raw_value="V9",
            source_ref=source_ref,
        ),
        build_duplicate_tag_candidate(
            run_id=RUN_ID,
            artifact_id=ART_ID,
            source_record_id="raw_00000000-0000-4000-8000-000000000003",
            tag_id="CHG_SOLAR_OUT_V",
            source_ref=source_ref,
            conflicts=["raw_00000000-0000-4000-8000-000000000002"],
        ),
        build_ambiguous_signal_candidate(
            run_id=RUN_ID,
            artifact_id=ART_ID,
            source_record_id="raw_00000000-0000-4000-8000-000000000002",
            raw_value="Output Voltage",
            source_ref=source_ref,
        ),
    ]
    assert all(candidate.needs_human_review for candidate in candidates)


def test_parsers_have_no_randomness_in_semantic_outputs():
    records = _demo_records()
    first_normalized, first_mappings = parse_signal_list_records(records=records)
    second_normalized, second_mappings = parse_signal_list_records(records=records)
    assert _semantic_snapshot(first_normalized, first_mappings) == _semantic_snapshot(
        second_normalized,
        second_mappings
    )