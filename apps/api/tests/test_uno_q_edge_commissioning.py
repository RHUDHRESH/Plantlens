"""Shadow edge commissioning tests for the UNO Q deployment."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import struct


MODULE_PATH = (
    Path(__file__).resolve().parents[3]
    / "deploy"
    / "uno-q"
    / "plantlens_app"
    / "python"
    / "edge_commissioning.py"
)
SPEC = importlib.util.spec_from_file_location("uno_q_edge_commissioning", MODULE_PATH)
assert SPEC and SPEC.loader
edge = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(edge)


def _words(value: float) -> tuple[int, int]:
    second, first = struct.unpack(">HH", struct.pack(">f", value))
    return first, second


def _rows(values: tuple[float, float, float, float], timestamp: str = "2026-08-23T13:00:00Z"):
    rows = []
    for start, value in zip((4, 6, 8, 10), values, strict=True):
        first, second = _words(value)
        rows.extend(
            [
                {"slave_id": 5, "register": start, "value": first, "timestamp": timestamp},
                {"slave_id": 5, "register": start + 1, "value": second, "timestamp": timestamp},
            ]
        )
    return rows


def test_live_like_high_load_yields_explainable_shadow_receipt():
    receipt = edge.commissioning_receipt(_rows((26.99, 24.26, 654.8, 0.0)))

    assert receipt["status"] == "SHADOW_RESULT"
    assert receipt["thresholds"]["state"] == "LOW_LOAD_ENVELOPE_EXCEEDED"
    assert receipt["thresholds"]["current_ratio"] > 10
    assert receipt["ensemble"]["top_shadow_candidate"] == "overload"
    assert receipt["ensemble"]["decision"] == "INSUFFICIENT_DATA"
    assert receipt["fault_summary"]["status"] == "SHADOW_CANDIDATE"
    assert len(receipt["ensemble"]["candidates"]) == 5
    assert receipt["runtime_diagnosis"] is False
    assert receipt["read_only"] is True


def test_mixed_modbus_timestamps_fail_closed():
    rows = _rows((27.0, 2.3, 62.0, 0.0))
    rows[-1]["timestamp"] = "2026-08-23T13:00:01Z"

    receipt = edge.commissioning_receipt(rows)

    assert receipt["status"] == "ABSTAIN"
    assert receipt["reason"] == "INCOHERENT_OR_INCOMPLETE_MODBUS_FRAME"
