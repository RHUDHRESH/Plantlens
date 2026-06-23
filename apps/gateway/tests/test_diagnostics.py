"""Gateway diagnostics tests."""

from __future__ import annotations

import json

from gateway.diagnostics import list_serial_ports, parse_line, probe_port


def test_list_serial_ports_returns_structured_rows():
    rows = list_serial_ports()
    assert isinstance(rows, list)
    for row in rows:
        assert {"device", "description", "hwid"} <= set(row)


def test_probe_missing_com_port_returns_failed_probe():
    result = probe_port("COM_DOES_NOT_EXIST_FOR_PLANTLENS_TEST", baudrate=9600)
    assert result.available is False
    assert result.port == "COM_DOES_NOT_EXIST_FOR_PLANTLENS_TEST"
    assert result.detail


def test_parse_line_does_not_post_to_api(tmp_path):
    tag_map_path = tmp_path / "tag_map.json"
    tag_map_path.write_text(
        json.dumps(
            {
                "tags": [
                    {
                        "tag": "MOTOR_301_CURRENT",
                        "asset_id": "MTR-301",
                        "unit": "A",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    result = parse_line(
        line="12.3",
        gateway_id="gw-rs485-1",
        default_tag_id="MOTOR_301_CURRENT",
        tag_map_path=tag_map_path,
    )

    assert result["ok"] is True
    assert result["frames"] == 1
    assert result["parsed"][0]["tag_id"] == "MOTOR_301_CURRENT"
    assert "responses" not in result
