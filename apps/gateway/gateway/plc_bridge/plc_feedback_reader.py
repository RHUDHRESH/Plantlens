"""Read PLC feedback registers — accept/deny from PLC interlocks."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

STATUS_LABELS = {
    0: "none",
    1: "received",
    2: "accepted",
    3: "denied",
    4: "executing",
    5: "completed",
    6: "failed",
}

DENY_LABELS = {
    0: "none",
    1: "interlock",
    2: "wrong_state",
    3: "manual_mode",
    4: "estop",
    5: "expired",
}


@dataclass(frozen=True, slots=True)
class PlcFeedback:
    action_status: int
    action_status_label: str
    deny_reason_code: int
    deny_reason_label: str
    last_action_id: int
    stale: bool = False


def parse_feedback(registers: dict[int, int], output_map: dict[str, list[dict[str, Any]]]) -> PlcFeedback:
    entries = {e["output_id"]: e for e in output_map.get("plc_feedback", [])}
    status_addr = int(entries["PLC_ACTION_STATUS"]["address"])
    deny_addr = int(entries["PLC_DENY_REASON_CODE"]["address"])
    last_id_addr = int(entries["PLC_LAST_ACTION_ID"]["address"])
    status = registers.get(status_addr, 0)
    deny = registers.get(deny_addr, 0)
    last_id = registers.get(last_id_addr, 0)
    return PlcFeedback(
        action_status=status,
        action_status_label=STATUS_LABELS.get(status, "unknown"),
        deny_reason_code=deny,
        deny_reason_label=DENY_LABELS.get(deny, "unknown"),
        last_action_id=last_id,
    )