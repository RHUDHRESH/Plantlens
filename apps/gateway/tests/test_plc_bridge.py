"""PLC advisory bridge tests (R9)."""

from gateway.plc_bridge.bridge_service import PlcBridgeService


def test_advisory_only_no_coils():
    bridge = PlcBridgeService()
    assert "coil" in bridge.FORBIDDEN_REGISTER_TYPES


def test_situation_change_writes_advisory():
    bridge = PlcBridgeService()
    situation = {
        "situation_id": "sit_1",
        "situation_type": "motor_overload",
        "root_asset_id": "MTR-301",
        "severity": "critical",
        "confidence_percent": 82,
    }
    changed = bridge.on_situation_change(situation)
    assert changed is True
    snapshot = bridge.snapshot()
    assert snapshot["advisory_registers"]


def test_duplicate_situation_skips_rewrite():
    bridge = PlcBridgeService()
    situation = {"situation_id": "sit_1", "situation_type": "motor_overload", "root_asset_id": "MTR-301"}
    assert bridge.on_situation_change(situation) is True
    assert bridge.on_situation_change(situation) is False


def test_plc_denial_visible_in_feedback():
    bridge = PlcBridgeService()
    feedback = bridge.read_feedback({210: 3, 211: 4, 212: 7})
    assert feedback.action_status_label == "denied"
    assert feedback.deny_reason_label == "estop"