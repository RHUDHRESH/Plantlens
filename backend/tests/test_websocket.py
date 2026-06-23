"""WebSocket endpoint tests."""

from fastapi.testclient import TestClient

from alarm_engine import reset_state as reset_alarms
from dag_engine import reset_state as reset_dag
from main import app


client = TestClient(app)


def setup_function():
    reset_alarms()
    reset_dag()


def test_websocket_connects_and_receives_conn_status():
    with client.websocket_connect('/ws/live') as ws:
        msg = ws.receive_json()
        assert msg['type'] == 'CONN_STATUS'
        assert 'connected' in msg['payload']
        assert 'port' in msg['payload']


def test_websocket_initial_situation_payload():
    with client.websocket_connect('/ws/live') as ws:
        ws.receive_json()  # CONN_STATUS
        # May receive ALARM messages if any active — drain until SITUATION or timeout
        got_situation = False
        for _ in range(5):
            msg = ws.receive_json()
            if msg['type'] == 'SITUATION':
                got_situation = True
                assert isinstance(msg['payload'], list)
                break
        assert got_situation