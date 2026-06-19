"""Generate structured response checklists from situation type."""

from __future__ import annotations

from typing import Any

_DEFAULT = [
    {"id": "verify_root", "label": "Verify root asset condition and isolation status", "status": "pending"},
    {"id": "review_alarms", "label": "Review raw alarms and confirm they match the evidence bundle", "status": "pending"},
    {"id": "first_action", "label": "Execute the recommended first check from the Calm Card", "status": "pending"},
]

_BY_TYPE: dict[str, list[dict[str, str]]] = {
    "motor_overload": [
        {"id": "check_motor_load", "label": "Inspect motor load and coupling for mechanical binding", "status": "pending"},
        {"id": "check_cooling", "label": "Verify motor cooling/airflow and temperature trend", "status": "pending"},
        {"id": "check_bus", "label": "Confirm DC bus voltage stability upstream", "status": "pending"},
    ],
}


def build_checklist_for_situation(situation_type: str | None) -> list[dict[str, Any]]:
    template = _BY_TYPE.get(situation_type or "", _DEFAULT)
    return [dict(item) for item in template]