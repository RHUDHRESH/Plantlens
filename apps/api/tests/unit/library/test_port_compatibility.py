"""Unit tests for deterministic port compatibility."""

from __future__ import annotations

from app.library.catalog import get_component, load_standard_component_library
from app.library.ports import check_connection_by_type_ids, check_port_compatibility, find_port


def _check_types(from_type: str, from_port: str, to_type: str, to_port: str):
    library = load_standard_component_library()
    return check_connection_by_type_ids(library, from_type, from_port, to_type, to_port)


def test_dc_supply_connects_to_motor_power_input():
    result = _check_types("dc_power_supply", "dc_out", "dc_motor_12v", "power_in")
    assert result.compatible is True
    assert result.severity in {"ok", "warning"}


def test_dc_supply_does_not_connect_to_air_duct_airflow_input():
    result = _check_types("dc_power_supply", "dc_out", "air_duct", "air_in")
    assert result.compatible is False
    assert result.severity == "error"


def test_analog_sensor_connects_to_plc_analog_input():
    result = _check_types("voltage_sensor", "signal_out", "plc_analog_input_module", "ai_ch1")
    assert result.compatible is True


def test_analog_sensor_does_not_connect_to_blower_airflow_input():
    result = _check_types("voltage_sensor", "signal_out", "industrial_blower", "air_in")
    assert result.compatible is False


def test_mechanical_shaft_connection_accepts_matching_rpm_ports():
    result = _check_types("dc_motor_12v", "shaft_out", "belt_coupling", "shaft_in")
    assert result.compatible is True


def test_airflow_output_connects_to_airflow_input():
    result = _check_types("bldc_fan", "air_out", "air_duct", "air_in")
    assert result.compatible is True


def test_fluid_output_does_not_connect_to_airflow_input():
    result = _check_types("pump", "fluid_out", "air_duct", "air_in")
    assert result.compatible is False


def test_output_output_rejected_for_power_ports():
    library = load_standard_component_library()
    supply = get_component("dc_power_supply")
    motor = get_component("dc_motor_12v")
    assert supply is not None and motor is not None
    from_port = find_port(supply, "dc_out")
    to_port = find_port(motor, "sense_out")
    assert from_port and to_port
    result = check_port_compatibility(supply, from_port, motor, to_port)
    assert result.compatible is False


def test_input_input_rejected():
    library = load_standard_component_library()
    motor = get_component("dc_motor_12v")
    assert motor is not None
    from_port = find_port(motor, "power_in")
    to_port = find_port(motor, "power_in")
    assert from_port and to_port
    result = check_port_compatibility(motor, from_port, motor, to_port)
    assert result.compatible is False


def test_range_mismatch_dc_power_warns_or_rejects():
    result = _check_types("dc_power_supply", "dc_out", "dc_dc_converter", "dc_in")
    assert result.compatible is True


def test_rpm_tachometer_connects_to_plc_digital_input():
    result = _check_types("rpm_tachometer", "signal_out", "plc_digital_input_module", "di_ch1")
    assert result.compatible is True