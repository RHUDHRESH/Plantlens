from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


def test_health():
    resp = client.get('/api/health')
    assert resp.status_code == 200
    assert resp.json()['status'] == 'ok'


def test_model_endpoint():
    resp = client.get('/api/model')
    assert resp.status_code == 200
    data = resp.json()
    assert data['tag_count'] == 21


def test_ports_endpoint():
    resp = client.get('/api/ports')
    assert resp.status_code == 200
    assert 'ports' in resp.json()


def test_connection_status():
    resp = client.get('/api/connection/status')
    assert resp.status_code == 200
    assert 'connected' in resp.json()