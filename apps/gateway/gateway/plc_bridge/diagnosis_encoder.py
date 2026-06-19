"""Encode Situation into advisory register codes — display only, never direct control."""

from __future__ import annotations

from typing import Any

SITUATION_CODES: dict[str, int] = {
    "motor_overload": 301,
    "bus_undervoltage": 102,
    "none": 0,
}

ASSET_CODES: dict[str, int] = {
    "MTR-301": 301,
    "BUS-101": 101,
    "INV-102": 102,
    "PV-101": 101,
    "BAT-101": 101,
}

SEVERITY_CODES: dict[str, int] = {
    "info": 1,
    "warning": 2,
    "critical": 3,
    "normal": 0,
}


def encode_situation(situation: dict[str, Any] | None) -> dict[str, int]:
    if not situation:
        return {
            "PLANTLENS_ACTIVE": 0,
            "SITUATION_CODE": 0,
            "ROOT_ASSET_CODE": 0,
            "SEVERITY_CODE": 0,
            "CONFIDENCE_PERCENT": 0,
            "RECOMMENDED_ACTION_CODE": 0,
        }
    situation_type = situation.get("situation_type", "none")
    root = situation.get("root_asset_id", "")
    severity = situation.get("severity", "info")
    confidence = int(situation.get("confidence_percent", 70))
    action_code = int(situation.get("recommended_action_code", 0))
    return {
        "PLANTLENS_ACTIVE": 1,
        "SITUATION_CODE": SITUATION_CODES.get(situation_type, 999),
        "ROOT_ASSET_CODE": ASSET_CODES.get(root, 0),
        "SEVERITY_CODE": SEVERITY_CODES.get(severity, 1),
        "CONFIDENCE_PERCENT": max(0, min(100, confidence)),
        "RECOMMENDED_ACTION_CODE": action_code,
    }