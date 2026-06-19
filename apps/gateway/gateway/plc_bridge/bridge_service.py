"""PLC advisory bridge — Situation → advisory registers; action handshake only."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from gateway.plc_bridge.advisory_writer import AdvisoryWriter, load_output_map
from gateway.plc_bridge.action_request_writer import ActionRequest, ActionRequestWriter
from gateway.plc_bridge.plc_feedback_reader import PlcFeedback, parse_feedback


@dataclass
class PlcBridgeState:
    advisory: AdvisoryWriter = field(default_factory=AdvisoryWriter)
    action_writer: ActionRequestWriter = field(default_factory=ActionRequestWriter)
    feedback: PlcFeedback | None = None
    comms_ok: bool = True
    last_update_ms: float = 0.0


class PlcBridgeService:
    """Read-only DAG path: advisory display + request handshake. Never writes coils."""

    FORBIDDEN_REGISTER_TYPES = frozenset({"coil", "discrete_output"})

    def __init__(self) -> None:
        self._output_map = load_output_map()
        self._state = PlcBridgeState()

    @property
    def state(self) -> PlcBridgeState:
        return self._state

    def on_situation_change(self, situation: dict[str, Any] | None) -> bool:
        return self._state.advisory.update(situation)

    def submit_action_request(
        self,
        *,
        action_code: int,
        target_asset_code: int,
        operator_confirmation_code: int = 0,
    ) -> dict[int, int]:
        request = ActionRequest(
            request_id=self._state.action_writer._next_id,
            action_code=action_code,
            target_asset_code=target_asset_code,
            operator_confirmation_code=operator_confirmation_code,
        )
        return self._state.action_writer.submit(request, self._output_map)

    def read_feedback(self, registers: dict[int, int]) -> PlcFeedback:
        feedback = parse_feedback(registers, self._output_map)
        self._state.feedback = feedback
        return feedback

    def snapshot(self) -> dict[str, Any]:
        fb = self._state.feedback
        return {
            "comms_ok": self._state.comms_ok,
            "advisory_registers": self._state.advisory.registers,
            "action_request_registers": self._state.action_writer.registers,
            "feedback": {
                "action_status": fb.action_status_label if fb else "none",
                "deny_reason": fb.deny_reason_label if fb else "none",
                "last_action_id": fb.last_action_id if fb else 0,
                "stale": fb.stale if fb else True,
            },
        }