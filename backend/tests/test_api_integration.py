"""REST API integration tests."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import audit_ledger
import model_loader
from alarm_engine import reset_state as reset_alarms
from dag_engine import get_situations, reset_state as reset_dag
from main import app
from tag_decoder import TagFrame


client = TestClient(app)
BACKEND_DIR = Path(__file__).resolve().parent.parent


@pytest.fixture(autouse=True)
def clean_state(tmp_path, monkeypatch):
    reset_alarms()
    reset_dag()
    ledger = tmp_path / 'audit.jsonl'
    monkeypatch.setattr(audit_ledger, 'LEDGER_PATH', ledger)
    yield
    reset_alarms()
    reset_dag()


def _good_frame(tag_id: str, value: float) -> TagFrame:
    from datetime import datetime, timezone
    from model_loader import get_tag
    tag = get_tag(tag_id)
    return TagFrame(
        tag_id=tag_id,
        channel_ref=tag.channel_ref,
        raw=[0, 0],
        value=value,
        unit=tag.unit,
        quality='GOOD',
        ts=datetime.now(timezone.utc).isoformat(),
        source='modbus_rtu',
    )


def test_set_connection_config():
    resp = client.post('/api/connection', json={
        'port': 'COM7',
        'baudrate': 19200,
        'slave_id': 2,
        'poll_hz': 5.0,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data['status'] == 'config_updated'
    assert data['config']['port'] == 'COM7'

    status = client.get('/api/connection/status').json()
    assert status['port'] == 'COM7'


def test_scan_without_hardware_returns_error():
    resp = client.post('/api/scan')
    assert resp.status_code == 200
    data = resp.json()
    assert 'error' in data


def test_ack_writes_audit_chain():
    from alarm_engine import process_frames
    from dag_engine import process_alarm_event

    events = process_frames({'MOTOR.vibration': _good_frame('MOTOR.vibration', 7.0)})
    process_alarm_event(events[0])
    sit_id = get_situations()[0].situation_id

    resp = client.post(f'/api/ack/{sit_id}', json={
        'user_id': 'op1',
        'role': 'operator',
        'marked_as': 'REAL',
        'note': 'Confirmed bearing noise',
    })
    assert resp.status_code == 200
    entry = resp.json()['audit_entry']
    assert entry['type'] == 'ACK'
    assert entry['body']['situation_id'] == sit_id
    assert entry['hash'].startswith('sha256:')

    audit = client.get('/api/audit').json()
    assert len(audit['entries']) >= 1


def test_calm_card_endpoint():
    from alarm_engine import process_frames
    from dag_engine import process_alarm_event

    events = process_frames({'MOTOR.vibration': _good_frame('MOTOR.vibration', 7.0)})
    process_alarm_event(events[0])
    sit_id = get_situations()[0].situation_id

    resp = client.get(f'/api/calm-card/{sit_id}')
    assert resp.status_code == 200
    card = resp.json()['calm_card']
    assert card['headline']
    assert card['situation_id'] == sit_id


def test_calm_card_404():
    resp = client.get('/api/calm-card/SIT-NOTREAL')
    assert resp.status_code == 404


def test_actions_endpoint():
    from alarm_engine import process_frames
    from dag_engine import process_alarm_event

    events = process_frames({'MOTOR.vibration': _good_frame('MOTOR.vibration', 7.0)})
    process_alarm_event(events[0])
    sit_id = get_situations()[0].situation_id

    resp = client.get(f'/api/actions/{sit_id}?role=operator')
    assert resp.status_code == 200
    actions = resp.json()['actions']
    assert any(a['action_id'] == 'INSPECT_MOTOR_BEARING' for a in actions)


def test_situations_list_endpoint():
    from alarm_engine import process_frames
    from dag_engine import process_alarm_event

    events = process_frames({'DCBUS.voltage': _good_frame('DCBUS.voltage', 39.0)})
    process_alarm_event(events[0])

    resp = client.get('/api/situations')
    assert resp.status_code == 200
    sits = resp.json()['situations']
    assert len(sits) == 1
    assert sits[0]['alarm_count'] == 1


def test_bindings_commit_and_reload(tmp_path, monkeypatch):
    import shutil
    import main as main_module

    data_dir = tmp_path / 'data'
    shutil.copytree(BACKEND_DIR / 'data', data_dir)
    monkeypatch.setattr(model_loader, 'DATA_DIR', data_dir)
    monkeypatch.setattr(main_module, 'BACKEND_DIR', tmp_path)

    resp = client.post('/api/bindings', json={
        'bindings': [{
            'tag_id': 'M1.voltage',
            'description': 'PV branch voltage (commissioned)',
        }],
    })
    assert resp.status_code == 200
    assert resp.json()['status'] == 'committed'

    model_loader.load_model()
    tag = model_loader.get_tag('M1.voltage')
    assert tag.description == 'PV branch voltage (commissioned)'

    updated = json.loads((data_dir / 'tag_list.json').read_text())
    m1 = next(t for t in updated['tags'] if t['tag_id'] == 'M1.voltage')
    assert m1['description'] == 'PV branch voltage (commissioned)'


def test_model_includes_plant():
    resp = client.get('/api/model')
    data = resp.json()
    assert 'plant' in data
    assert data['plant']['plant_id'] == 'physical_bench_001'