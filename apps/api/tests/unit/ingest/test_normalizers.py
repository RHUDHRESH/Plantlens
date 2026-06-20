"""Unit tests for offline ingestion deterministic normalizers."""

from __future__ import annotations

from app.ingest.normalizers import (
    canonical_asset_id,
    canonical_tag_id,
    canonical_unit,
    is_valid_tag_id,
    normalize_data_type,
    normalize_function_code,
    normalize_priority,
    normalize_quality,
    normalize_register_address,
    normalize_timestamp,
    normalize_token,
    normalize_unit,
    slug_upper_hyphen,
)

PHYSICAL_DEMO_TAG_ROWS = [
    ("Solar Charger", "Output Voltage", "V1", "CHG_SOLAR_OUT_V"),
    ("Solar Charger", "Output Current", "I1", "CHG_SOLAR_OUT_I"),
    ("Solar Charger", "Output Power", "P1", "CHG_SOLAR_OUT_P"),
    ("Mains Charger", "Output Voltage", "V2", "CHG_MAINS_OUT_V"),
    ("Mains Charger", "Output Current", "I2", "CHG_MAINS_OUT_I"),
    ("Mains Charger", "Output Power", "P2", "CHG_MAINS_OUT_P"),
    ("24V Lithium Battery", "Voltage", "V3", "BAT_24V_V"),
    ("24V Lithium Battery", "Current", "I3", "BAT_24V_I"),
    ("24V Lithium Battery", "Power", "P3", "BAT_24V_P"),
    ("Inverter", "AC Output Voltage", "V4", "INV_AC_OUT_V"),
    ("Inverter", "AC Output Current", "I4", "INV_AC_OUT_I"),
    ("Inverter", "AC Output Power", "P4", "INV_AC_OUT_P"),
    ("VFD", "Motor Feed Voltage", "V5", "VFD_OUT_V"),
    ("VFD", "Motor Feed Current", "I5", "VFD_OUT_I"),
    ("VFD", "Motor Feed Power", "P5", "VFD_OUT_P"),
    ("FHP 3Phase AC Motor", "Speed", "N", "MTR_FHP_SPEED"),
    ("FHP 3Phase AC Motor", "Vibration", "Vib", "MTR_FHP_VIB"),
    ("FHP 3Phase AC Motor", "Temperature", "Temp", "MTR_FHP_TEMP"),
]

EXPECTED_PHYSICAL_DEMO_TAGS = {row[3] for row in PHYSICAL_DEMO_TAG_ROWS}


def test_normalize_token_is_stable():
    assert normalize_token(" AC Output  Voltage ") == "AC_OUTPUT_VOLTAGE"


def test_slug_upper_hyphen_is_stable():
    assert slug_upper_hyphen("24V Lithium Battery") == "24V-LITHIUM-BATTERY"


def test_canonical_asset_id_physical_demo_assets():
    assert canonical_asset_id("Solar Charger").value == "CHG-SOLAR"
    assert canonical_asset_id("Mains Charger").value == "CHG-MAINS"
    assert canonical_asset_id("24V Lithium Battery").value == "BAT-24V"
    assert canonical_asset_id("Inverter").value == "INV-001"
    assert canonical_asset_id("VFD").value == "VFD-001"
    assert canonical_asset_id("FHP 3Phase AC Motor").value == "MTR-FHP"


def test_canonical_asset_id_unknown_fallback_warns():
    result = canonical_asset_id("Random Pump 7")
    assert result.value == "RANDOM-PUMP-7"
    assert "unknown_asset_label" in result.warnings
    assert result.confidence < 0.7


def test_normalize_unit_known_units():
    assert normalize_unit("V").value == "V"
    assert normalize_unit("volt").value == "V"
    assert normalize_unit("volts").value == "V"
    assert normalize_unit("A").value == "A"
    assert normalize_unit("ampere").value == "A"
    assert normalize_unit("W").value == "W"
    assert normalize_unit("watts").value == "W"
    assert normalize_unit("rpm").value == "rpm"
    assert normalize_unit("rev/min").value == "rpm"
    assert normalize_unit("mmps").value == "mm/s"
    assert normalize_unit("mm/s").value == "mm/s"
    assert normalize_unit("degC").value == "degC"
    assert normalize_unit("°C").value == "degC"
    assert normalize_unit("celsius").value == "degC"


def test_normalize_unit_missing_warns():
    assert normalize_unit(None).value is None
    assert "missing_unit" in normalize_unit(None).warnings
    assert normalize_unit("").value is None
    assert "missing_unit" in normalize_unit("").warnings


def test_normalize_unit_unknown_warns():
    result = normalize_unit("banana")
    assert result.value == "banana"
    assert "unknown_unit" in result.warnings
    assert result.confidence < 0.7


def test_canonical_tag_id_generates_all_18_physical_demo_tags():
    generated = {
        canonical_tag_id(
            asset_label=asset_label,
            signal_label=signal_label,
            tag_hint=tag_hint,
        ).value
        for asset_label, signal_label, tag_hint, _ in PHYSICAL_DEMO_TAG_ROWS
    }
    assert generated == EXPECTED_PHYSICAL_DEMO_TAGS


def test_canonical_tag_id_missing_asset_or_signal_returns_none():
    missing_asset = canonical_tag_id(asset_label=None, signal_label="Output Voltage")
    missing_signal = canonical_tag_id(asset_label="Solar Charger", signal_label=None)
    assert missing_asset.value is None
    assert missing_signal.value is None
    assert missing_asset.confidence == 0.0
    assert "missing_asset_or_signal" in missing_asset.warnings


def test_canonical_tag_id_fallback_warns():
    result = canonical_tag_id(asset_label="Random Pump 7", signal_label="Flow Rate")
    assert result.value == "RANDOM_PUMP_7_FLOW_RATE"
    assert "fallback_tag_generated" in result.warnings
    assert result.confidence < 0.7


def test_is_valid_tag_id():
    assert is_valid_tag_id("CHG_SOLAR_OUT_V") is True
    assert is_valid_tag_id("chg_solar") is False
    assert is_valid_tag_id("BAD TAG") is False
    assert is_valid_tag_id("") is False


def test_normalize_register_address_decimal_and_hex():
    assert normalize_register_address("40001").value == "40001"
    assert normalize_register_address("0x0001").value == "1"


def test_normalize_register_address_invalid_warns():
    assert "invalid_register_address" in normalize_register_address("-1").warnings
    assert "invalid_register_address" in normalize_register_address("abc").warnings


def test_normalize_function_code_aliases():
    assert normalize_function_code("03").value == "3"
    assert normalize_function_code("FC03").value == "3"
    assert normalize_function_code("read holding registers").value == "3"


def test_normalize_data_type_aliases():
    assert normalize_data_type("real").value == "float32"
    assert normalize_data_type("unsigned16").value == "uint16"


def test_normalize_timestamp_timezone_aware_to_utc():
    result = normalize_timestamp("2026-06-20T12:00:00+05:30")
    assert result.value == "2026-06-20T06:30:00Z"


def test_normalize_timestamp_naive_assumes_plant_timezone():
    result = normalize_timestamp("2026-06-20T12:00:00", plant_timezone="Asia/Kolkata")
    assert result.value == "2026-06-20T06:30:00Z"
    assert "assumed_plant_timezone" in result.notes


def test_normalize_priority_text_and_numeric():
    assert normalize_priority("critical").value == "critical"
    assert normalize_priority("high").value == "high"
    assert normalize_priority("medium").value == "medium"
    assert normalize_priority("low").value == "low"
    assert normalize_priority("info").value == "info"
    assert normalize_priority(900).value == "critical"
    assert normalize_priority(700).value == "high"
    assert normalize_priority(400).value == "medium"
    assert normalize_priority(200).value == "low"
    assert normalize_priority(10).value == "info"


def test_normalize_quality_values():
    assert normalize_quality("good").value == "good"
    assert normalize_quality("ok").value == "good"
    assert normalize_quality("bad").value == "bad"
    assert normalize_quality("stale").value == "bad"
    assert normalize_quality("uncertain").value == "uncertain"
    assert normalize_quality("suspect").value == "uncertain"
    assert normalize_quality(None).value == "unknown"
    assert "missing_quality" in normalize_quality(None).warnings
    assert normalize_quality("weird").value == "unknown"
    assert "unknown_quality" in normalize_quality("weird").warnings


def test_normalizers_have_no_randomness():
    first = canonical_tag_id(
        asset_label="Solar Charger",
        signal_label="Output Voltage",
        tag_hint="V1",
    )
    second = canonical_tag_id(
        asset_label="Solar Charger",
        signal_label="Output Voltage",
        tag_hint="V1",
    )
    assert first.value == second.value == "CHG_SOLAR_OUT_V"
    assert first.confidence == second.confidence == 1.0


def test_canonical_unit_delegates_to_normalize_unit():
    assert canonical_unit("volt") == "V"
    assert canonical_unit("") is None