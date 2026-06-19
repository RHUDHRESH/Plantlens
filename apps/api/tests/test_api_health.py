"""API shell health endpoints, guardian red-team, and import boundary tests."""

import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.settings import get_settings

API_ROOT = Path(__file__).resolve().parents[1]

FORBIDDEN_IMPORT_PREFIXES = (
    "app.gateway",
    "app.agents",
)

FORBIDDEN_OPENAPI_PREFIXES = (
    "/api/v1/simulator",
    "/api/v1/compiler",
    "/api/v1/runtime",
    "/api/v1/agents",
    "/api/v1/incidents",
)

ALLOWED_API_PREFIXES = (
    "/healthz",
    "/readyz",
    "/metrics",
    "/internal/auth-test/",
    "/api/scenarios/",
    "/api/compiler/",
    "/api/hmi/",
    "/api/runtime/",
    "/api/ws/",
    "/api/ingest/",
    "/api/incidents",
    "/api/incidents/",
    "/api/agents/",
    "/api/plc/",
)

SECRET_FIELD_NAMES = frozenset(
    {
        "database_url",
        "gateway_ingest_token",
        "oidc_issuer",
        "oidc_audience",
        "oidc_jwks_url",
        "agents_base_url",
        "otel_exporter_otlp_endpoint",
    }
)

READINESS_MISLEADING_TERMS = frozenset(
    {
        "db",
        "database",
        "simulator",
        "gateway",
        "plc",
        "agent",
        "connected",
        "online",
    }
)


def create_app():
    from app.main import create_app as _create_app

    return _create_app()


# --- Basic health shell (Prompt 7) ---


def test_healthz_returns_ok(client: TestClient):
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "plantlens-api"}


def test_readyz_returns_active_plant_id(client: TestClient):
    response = client.get("/readyz")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["active_plant_id"] == "demo_microgrid_001"


def test_request_id_header_generated(client: TestClient):
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.headers.get("X-Request-ID")


def test_request_id_header_preserved(client: TestClient):
    incoming = "trace-abc-123"
    response = client.get("/healthz", headers={"X-Request-ID": incoming})
    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == incoming


def test_openapi_json_available(client: TestClient):
    response = client.get("/openapi.json")
    assert response.status_code == 200
    body = response.json()
    assert body["info"]["title"] == "PlantLens API"
    assert body["info"]["version"] == "0.1.0"


# --- Red-team: no runtime side effects ---


def test_main_import_does_not_load_heavy_subsystems():
    """Fresh interpreter import of app.main must not pull runtime/DB/auth/studio modules."""
    prefixes = FORBIDDEN_IMPORT_PREFIXES
    script = (
        "import sys; "
        "import app.main; "
        f"prefixes = {prefixes!r}; "
        "mods = sorted(m for m in sys.modules if any(m.startswith(p) for p in prefixes)); "
        "print(mods)"
    )
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=API_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "[]"


def test_startup_does_not_create_runtime_artifacts(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Lifespan must not create compiled/runtime directories or on-disk DB files in tests."""
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    get_settings.cache_clear()
    with TestClient(create_app()) as test_client:
        response = test_client.get("/healthz")
        assert response.status_code == 200

    assert not (tmp_path / "plantlens.db").exists()
    assert not (tmp_path / "compiled").exists()


# --- Red-team: no fake readiness / no secrets ---


def test_readyz_exposes_only_shell_fields(client: TestClient):
    body = client.get("/readyz").json()
    assert set(body.keys()) == {"status", "active_plant_id", "database"}


def test_readyz_does_not_leak_secrets(client: TestClient):
    body = client.get("/readyz").json()
    for key in SECRET_FIELD_NAMES:
        assert key not in body
    values_serialized = " ".join(str(value).lower() for value in body.values())
    for term in READINESS_MISLEADING_TERMS:
        assert term not in values_serialized
    assert "change-me" not in values_serialized
    assert "sqlite" not in values_serialized


def test_readyz_body_has_no_request_id(client: TestClient):
    body = client.get("/readyz", headers={"X-Request-ID": "must-not-appear-in-body"}).json()
    assert "must-not-appear-in-body" not in str(body)
    assert "request_id" not in body


# --- Red-team: settings override ---


def test_readyz_reports_active_plant_override(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ACTIVE_PLANT_ID", "plant_red_team_999")
    get_settings.cache_clear()
    with TestClient(create_app()) as test_client:
        response = test_client.get("/readyz")
    assert response.status_code == 200
    assert response.json()["active_plant_id"] == "plant_red_team_999"


def test_cors_respects_web_origin_override(monkeypatch: pytest.MonkeyPatch):
    allowed = "http://allowed-red-team.test"
    monkeypatch.setenv("WEB_ORIGIN", allowed)
    get_settings.cache_clear()
    with TestClient(create_app()) as test_client:
        response = test_client.options(
            "/healthz",
            headers={
                "Origin": allowed,
                "Access-Control-Request-Method": "GET",
            },
        )
    assert response.headers.get("access-control-allow-origin") == allowed


def test_shell_boots_with_empty_oidc_and_custom_gateway_token(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("OIDC_ISSUER", "")
    monkeypatch.setenv("OIDC_AUDIENCE", "")
    monkeypatch.setenv("OIDC_JWKS_URL", "")
    monkeypatch.setenv("GATEWAY_INGEST_TOKEN", "totally-invalid-but-ok-for-shell")
    get_settings.cache_clear()
    with TestClient(create_app()) as test_client:
        response = test_client.get("/healthz")
    assert response.status_code == 200


# --- Red-team: request-ID challenge ---


def test_request_id_on_404(client: TestClient):
    response = client.get("/definitely-not-a-route", headers={"X-Request-ID": "404-trace-id"})
    assert response.status_code == 404
    assert response.headers["X-Request-ID"] == "404-trace-id"
    assert "404-trace-id" not in response.text


def test_request_id_generated_on_404(client: TestClient):
    response = client.get("/also-missing")
    assert response.status_code == 404
    assert response.headers.get("X-Request-ID")


# --- Red-team: CORS challenge ---


def test_cors_preflight_allows_configured_origin(client: TestClient):
    origin = "http://localhost:5173"
    response = client.options(
        "/healthz",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.headers.get("access-control-allow-origin") == origin


def test_cors_preflight_rejects_unconfigured_origin(client: TestClient):
    evil = "http://evil-red-team.example"
    response = client.options(
        "/healthz",
        headers={
            "Origin": evil,
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.headers.get("access-control-allow-origin") != evil


# --- Red-team: route boundary / OpenAPI ---


def test_openapi_includes_health_routes(client: TestClient):
    paths = client.get("/openapi.json").json()["paths"]
    assert "/healthz" in paths
    assert "/readyz" in paths


def test_openapi_excludes_future_product_routes(client: TestClient):
    paths = client.get("/openapi.json").json()["paths"]
    for path in paths:
        for forbidden in FORBIDDEN_OPENAPI_PREFIXES:
            assert not path.startswith(forbidden), f"unexpected future route in OpenAPI: {path}"


def test_only_expected_shell_and_chunk_routes_mounted(client: TestClient):
    paths = set(client.get("/openapi.json").json()["paths"])
    for path in paths:
        assert any(
            path == prefix or path.startswith(prefix) for prefix in ALLOWED_API_PREFIXES
        ), f"unexpected route in OpenAPI: {path}"
    assert "/healthz" in paths
    assert "/readyz" in paths


# --- Red-team: lifespan challenge ---


def test_lifespan_binds_settings(client: TestClient):
    assert client.app.state.settings is not None
    assert client.app.state.settings.active_plant_id == "demo_microgrid_001"


def test_lifespan_shutdown_completes_without_error():
    get_settings.cache_clear()
    with TestClient(create_app()) as test_client:
        test_client.get("/healthz")
    # Context exit runs shutdown; no exception means pass.


def test_lifespan_registers_settings_only_on_app_state(client: TestClient):
    """Lifespan binds settings; DB engine stays in session module, not app.state."""
    state_keys = set(client.app.state._state.keys())
    assert state_keys == {"settings"}