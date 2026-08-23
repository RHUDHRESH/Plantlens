"""PLC advisory bridge tests (R9)."""

from gateway.plc_bridge.advisory_writer import AdvisoryWriter
from gateway.plc_bridge.bridge_service import PlcBridgeService
from gateway.plc_bridge.diagnosis_encoder import encode_situation


class _MockModbusClient:
    """Records FC06/FC16 calls; never writes coils."""

    def __init__(self) -> None:
        self.writes: list[tuple[str, int, list[int], int]] = []

    def write_register(self, address: int, value: int, *, device_id: int = 1):
        self.writes.append(("FC06", address, [value], device_id))

    def write_registers(self, address: int, values: list[int], *, device_id: int = 1):
        self.writes.append(("FC16", address, list(values), device_id))


def test_advisory_only_no_coils():
    bridge = PlcBridgeService()
    assert "coil" in bridge.FORBIDDEN_REGISTER_TYPES


def test_advisory_encode_situation_codes():
    encoded = encode_situation(
        {
            "situation_type": "motor_overload",
            "root_asset_id": "MTR-301",
            "severity": "critical",
            "confidence_percent": 82,
            "recommended_action_code": 7,
        }
    )
    assert encoded["PLANTLENS_ACTIVE"] == 1
    assert encoded["SITUATION_CODE"] == 301
    assert encoded["ROOT_ASSET_CODE"] == 301
    assert encoded["SEVERITY_CODE"] == 3
    assert encoded["CONFIDENCE_PERCENT"] == 82
    assert encoded["RECOMMENDED_ACTION_CODE"] == 7


def test_advisory_encode_none_clears_registers():
    encoded = encode_situation(None)
    assert encoded["PLANTLENS_ACTIVE"] == 0
    assert encoded["SITUATION_CODE"] == 0


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


def test_advisory_writer_memory_fallback_without_client():
    writer = AdvisoryWriter()
    changed = writer.update(
        {
            "situation_id": "sit_mem",
            "situation_type": "motor_overload",
            "root_asset_id": "MTR-301",
            "severity": "critical",
            "confidence_percent": 80,
        }
    )
    assert changed is True
    assert writer.registers
    assert writer.last_modbus_writes == []
    assert 100 in writer.registers


def test_advisory_writer_modbus_fc16_for_allowlisted_addresses():
    client = _MockModbusClient()
    writer = AdvisoryWriter(client=client, slave_id=2)
    situation = {
        "situation_id": "sit_modbus",
        "situation_type": "motor_overload",
        "root_asset_id": "MTR-301",
        "severity": "critical",
        "confidence_percent": 82,
        "recommended_action_code": 7,
    }
    assert writer.update(situation) is True
    assert writer.registers
    # Contiguous advisory block 100-105 → single FC16 holding write.
    assert client.writes
    written_addrs: set[int] = set()
    for fc, address, values, device_id in client.writes:
        assert device_id == 2
        assert fc in {"FC06", "FC16"}
        for offset, _value in enumerate(values):
            written_addrs.add(address + offset)
    assert written_addrs <= writer.allowlisted_addresses
    assert 100 in written_addrs
    assert 101 in written_addrs
    # Never coils — only holding addresses from the advisory allowlist.
    assert writer.last_modbus_writes
    assert writer.last_modbus_writes[0][0] == "FC16"
    assert writer.last_modbus_writes[0][1] == 100
    assert set(range(100, 106)).issubset(written_addrs)


def test_advisory_writer_skips_coil_map_entries():
    output_map = {
        "advisory": [
            {
                "output_id": "PLANTLENS_ACTIVE",
                "register_type": "holding",
                "address": 100,
                "data_type": "uint16",
            },
            {
                "output_id": "SITUATION_CODE",
                "register_type": "coil",
                "address": 1,
                "data_type": "uint16",
            },
        ]
    }
    client = _MockModbusClient()
    writer = AdvisoryWriter(output_map=output_map, client=client)
    writer.update(
        {
            "situation_id": "sit_coil",
            "situation_type": "motor_overload",
            "root_asset_id": "MTR-301",
        }
    )
    written = {addr for _fc, addr, values, _id in client.writes for addr in range(addr, addr + len(values))}
    assert 100 in written
    assert 1 not in written
    assert 1 not in writer.allowlisted_addresses
