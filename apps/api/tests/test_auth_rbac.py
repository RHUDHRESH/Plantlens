"""Auth & RBAC tests (Prompt 11) and auth guardian red-team (Prompt 12)."""

from __future__ import annotations

import inspect
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.auth.service import AuthConfigurationError, issue_dev_token
from app.runtime.runtime_state import runtime_state
from app.settings import get_settings

API_ROOT = Path(__file__).resolve().parents[1]

AUTH_FORBIDDEN_IMPORT_PREFIXES = ("app.runtime", "app.studio", "app.gateway", "app.agents")

SECRET_LIKE_SUBSTRINGS = (
    "test-secret-for-pytest",
    "PLANTLENS_DEV_JWT_SECRET",
    "change-me",
    "eyJ",
)


def _auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _dev_token(client: TestClient, *, role: str, subject: str = "test-user") -> str:
    response = client.post(
        "/internal/auth-test/dev-token",
        json={"role": role, "subject": subject},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


# --- Prompt 11: RBAC matrix ---


def test_unauthenticated_engineer_write_rejected(client: TestClient):
    response = client.post("/internal/auth-test/engineer-write")
    assert response.status_code == 401
    assert response.json()["detail"] == "Missing bearer token"


def test_invalid_bearer_token_rejected(client: TestClient):
    response = client.post(
        "/internal/auth-test/engineer-write",
        headers=_auth_header("not-a-jwt"),
    )
    assert response.status_code == 401
    assert "token" in response.json()["detail"].lower()


def test_expired_dev_token_rejected(client: TestClient):
    settings = get_settings()
    token = issue_dev_token(settings, subject="expired-user", role="engineer", ttl_seconds=-60)
    response = client.post(
        "/internal/auth-test/engineer-write",
        headers=_auth_header(token),
    )
    assert response.status_code == 401


def test_viewer_can_read_probe(client: TestClient):
    token = _dev_token(client, role="viewer")
    response = client.get("/internal/auth-test/viewer", headers=_auth_header(token))
    assert response.status_code == 200
    assert response.json()["role"] == "viewer"


def test_viewer_cannot_engineer_write(client: TestClient):
    token = _dev_token(client, role="viewer")
    response = client.post(
        "/internal/auth-test/engineer-write",
        headers=_auth_header(token),
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Insufficient role"


def test_engineer_can_write(client: TestClient):
    token = _dev_token(client, role="engineer")
    response = client.post(
        "/internal/auth-test/engineer-write",
        headers=_auth_header(token),
    )
    assert response.status_code == 200
    assert response.json()["role"] == "engineer"


def test_admin_only_endpoint(client: TestClient):
    engineer = _dev_token(client, role="engineer")
    assert client.post(
        "/internal/auth-test/admin-only",
        headers=_auth_header(engineer),
    ).status_code == 403

    admin = _dev_token(client, role="admin")
    response = client.post(
        "/internal/auth-test/admin-only",
        headers=_auth_header(admin),
    )
    assert response.status_code == 200
    assert response.json()["role"] == "admin"


def test_operator_can_approve(client: TestClient):
    token = _dev_token(client, role="operator")
    response = client.post(
        "/internal/auth-test/approve",
        headers=_auth_header(token),
    )
    assert response.status_code == 200
    assert response.json()["status"] == "approved"


def test_agent_cannot_approve_human_gated_action(client: TestClient):
    """Rule R5 — agent role must never pass human-approver gates."""
    token = _dev_token(client, role="agent", subject="svc-agent-1")
    response = client.post(
        "/internal/auth-test/approve",
        headers=_auth_header(token),
    )
    assert response.status_code == 403
    assert "agent" in response.json()["detail"].lower()


@pytest.mark.parametrize(
    ("role", "expected_status"),
    [
        ("viewer", 403),
        ("agent", 403),
        ("operator", 200),
        ("maintenance", 200),
        ("engineer", 200),
        ("admin", 200),
    ],
)
def test_human_approval_matrix_is_explicit(
    client: TestClient,
    role: str,
    expected_status: int,
):
    token = _dev_token(client, role=role, subject=f"{role}-subject")
    response = client.post("/internal/auth-test/approve", headers=_auth_header(token))
    assert response.status_code == expected_status


def test_agent_actor_type_cannot_approve_even_with_operator_role(client: TestClient):
    settings = get_settings()
    token = issue_dev_token(
        settings,
        subject="agent-disguised-as-operator",
        role="operator",
        actor_type="agent",
    )
    response = client.post("/internal/auth-test/approve", headers=_auth_header(token))
    assert response.status_code == 403
    assert "agent" in response.json()["detail"].lower()


def test_whoami_returns_principal_fields(client: TestClient):
    token = _dev_token(client, role="maintenance", subject="maint-42")
    response = client.get("/internal/auth-test/whoami", headers=_auth_header(token))
    assert response.status_code == 200
    body = response.json()
    assert body["subject"] == "maint-42"
    assert body["role"] == "maintenance"
    assert body["actor_type"] == "user"


def test_auth_errors_do_not_leak_secrets(client: TestClient):
    response = client.post(
        "/internal/auth-test/engineer-write",
        headers=_auth_header("totally.invalid.token"),
    )
    serialized = response.text.lower()
    for secret in SECRET_LIKE_SUBSTRINGS:
        assert secret.lower() not in serialized


# --- Prompt 12: Auth guardian ---


def test_non_bearer_authorization_scheme_rejected(client: TestClient):
    response = client.get(
        "/internal/auth-test/viewer",
        headers={"Authorization": "Basic not-a-bearer-token"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Missing bearer token"


def test_prod_without_oidc_returns_503_not_bypass(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("PLANTLENS_ENV", "prod")
    monkeypatch.setenv("PLANTLENS_DEV_JWT_SECRET", "")
    monkeypatch.setenv("OIDC_ISSUER", "")
    monkeypatch.setenv("OIDC_AUDIENCE", "")
    monkeypatch.setenv("OIDC_JWKS_URL", "")
    get_settings.cache_clear()

    from app.main import create_app

    with TestClient(create_app()) as test_client:
        response = test_client.get(
            "/internal/auth-test/viewer",
            headers=_auth_header("not-configured"),
        )
    assert response.status_code == 503
    assert response.json()["detail"] == "Authentication is not configured"


def test_dev_token_without_secret_returns_503(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("PLANTLENS_ENV", "dev")
    monkeypatch.setenv("PLANTLENS_DEV_JWT_SECRET", "")
    monkeypatch.setenv("OIDC_ISSUER", "")
    monkeypatch.setenv("OIDC_AUDIENCE", "")
    monkeypatch.setenv("OIDC_JWKS_URL", "")
    get_settings.cache_clear()

    from app.main import create_app

    with TestClient(create_app()) as test_client:
        response = test_client.post(
            "/internal/auth-test/dev-token",
            json={"role": "operator"},
        )
    assert response.status_code == 503
    assert "PLANTLENS_DEV_JWT_SECRET" in response.json()["detail"]


def test_malformed_jwt_returns_401(client: TestClient):
    response = client.get(
        "/internal/auth-test/viewer",
        headers=_auth_header("a.b"),
    )
    assert response.status_code == 401


def test_tampered_dev_token_signature_returns_401(client: TestClient):
    token = _dev_token(client, role="engineer")
    header, payload, _signature = token.split(".")
    tampered = f"{header}.{payload}.tampered-signature"
    response = client.post(
        "/internal/auth-test/engineer-write",
        headers=_auth_header(tampered),
    )
    assert response.status_code == 401


def test_unrecognized_role_claim_rejected(client: TestClient):
    settings = get_settings()
    token = issue_dev_token(
        settings,
        subject="bad-role-user",
        role="superadmin",  # type: ignore[arg-type]
    )
    response = client.get("/internal/auth-test/viewer", headers=_auth_header(token))
    assert response.status_code == 401
    assert "role" in response.json()["detail"].lower()


def test_agent_with_admin_claim_still_cannot_approve(client: TestClient):
    """Broad token claims cannot bypass the human-approver guard."""
    settings = get_settings()
    token = issue_dev_token(
        settings,
        subject="rogue-agent",
        role="agent",
        actor_type="agent",
    )
    response = client.post(
        "/internal/auth-test/approve",
        headers=_auth_header(token),
    )
    assert response.status_code == 403


@pytest.mark.parametrize(
    ("role", "expected_status"),
    [
        ("viewer", 403),
        ("agent", 403),
        ("operator", 200),
        ("maintenance", 200),
        ("engineer", 200),
        ("admin", 200),
    ],
)
def test_alarm_ack_requires_human_approver_role(
    client: TestClient,
    role: str,
    expected_status: int,
):
    runtime_state.active_alarms["ALARM_REDTEAM"] = {
        "alarm_id": "ALARM_REDTEAM",
        "acked": False,
    }
    token = _dev_token(client, role=role, subject=f"{role}-ack")
    try:
        response = client.post(
            "/api/runtime/alarms/ALARM_REDTEAM/ack",
            headers=_auth_header(token),
        )
    finally:
        runtime_state.active_alarms.pop("ALARM_REDTEAM", None)

    assert response.status_code == expected_status
    if expected_status == 200:
        assert response.json()["status"] == "ok"


def test_auth_module_has_no_hardcoded_secrets():
    auth_dir = API_ROOT / "app" / "auth"
    for path in auth_dir.glob("*.py"):
        text = path.read_text(encoding="utf-8")
        assert "test-secret-for-pytest" not in text
        assert "password123" not in text
        assert "sk-" not in text


def test_auth_does_not_import_runtime_engines():
    script = (
        "import sys; "
        "import app.auth.service; "
        "import app.auth.dependencies; "
        f"prefixes = {AUTH_FORBIDDEN_IMPORT_PREFIXES!r}; "
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


def test_dev_token_endpoint_hidden_in_prod(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("PLANTLENS_ENV", "prod")
    monkeypatch.setenv("PLANTLENS_DEV_JWT_SECRET", "should-not-be-used")
    get_settings.cache_clear()

    from app.main import create_app

    with TestClient(create_app()) as test_client:
        response = test_client.post(
            "/internal/auth-test/dev-token",
            json={"role": "admin"},
        )
    assert response.status_code == 404


def test_oidc_mode_documented_in_auth_readme():
    readme = (API_ROOT / "app" / "auth" / "README.md").read_text(encoding="utf-8")
    assert "OIDC" in readme
    assert "PLANTLENS_DEV_JWT_SECRET" in readme or "dev" in readme.lower()


def test_issue_dev_token_rejects_non_dev_env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("PLANTLENS_ENV", "prod")
    get_settings.cache_clear()
    settings = get_settings()
    with pytest.raises(AuthConfigurationError):
        issue_dev_token(settings, subject="x", role="admin")


def test_healthz_unaffected_when_auth_unconfigured(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("PLANTLENS_ENV", "prod")
    monkeypatch.setenv("PLANTLENS_DEV_JWT_SECRET", "")
    get_settings.cache_clear()

    from app.main import create_app

    with TestClient(create_app()) as test_client:
        assert test_client.get("/healthz").status_code == 200
        assert test_client.get("/readyz").status_code == 200


def test_auth_dependencies_use_fastapi_depends():
    from app.auth import dependencies as auth_deps

    assert "Depends" in inspect.getsource(auth_deps.get_current_principal)
    assert "Depends" in inspect.getsource(auth_deps.require_human_approver)
