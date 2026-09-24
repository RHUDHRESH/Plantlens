"""End-to-end change pipeline: draft → engineer review → revision → compile → hot deploy."""

from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.models.audit import AuditRecordRow
from app.db.session import get_session_factory
from app.runtime.alarm_engine import reset_alarm_engine_state
from app.runtime.config_loader import get_runtime_config, reset_runtime_config_for_tests

PATTERN = "induction_motor.mechanical_overload"
PL_EDGE = "PL-MTR-301-INV-102"


@pytest.fixture(autouse=True)
def _reset_runtime():
    reset_runtime_config_for_tests()
    reset_alarm_engine_state()
    yield
    reset_runtime_config_for_tests()
    reset_alarm_engine_state()


def _auth(client: TestClient, role: str, subject: str | None = None) -> dict[str, str]:
    token = client.post(
        "/internal/auth-test/dev-token",
        json={"role": role, "subject": subject or f"{role}-1"},
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _instantiate(client: TestClient, submit: bool = True) -> dict:
    response = client.post(
        f"/api/library/patterns/{PATTERN}/instantiate",
        json={"asset_id": "MTR-301", "submit": submit},
        headers=_auth(client, "engineer", "eng-author"),
    )
    assert response.status_code == 200, response.text
    return response.json()


def _submit_edge(client: TestClient, edge: dict, title: str = "Manual edge") -> dict:
    response = client.post(
        "/api/changes",
        json={"title": title, "source": "engineer", "ops": [{"op": "add_edge", "edge": edge}]},
        headers=_auth(client, "engineer", "eng-author"),
    )
    assert response.status_code == 200, response.text
    return response.json()["change"]


def _review(client: TestClient, change_id: str, role: str = "engineer", **body) -> object:
    payload = {"decision": "approve", "comment": "Checked against P&ID", **body}
    return client.post(
        f"/api/changes/{change_id}/review", json=payload, headers=_auth(client, role, f"{role}-reviewer")
    )


def _audit_actions() -> list[str]:
    async def _load() -> list[str]:
        async with get_session_factory()() as session:
            rows = (await session.execute(select(AuditRecordRow))).scalars()
            return [r.action for r in rows]

    return asyncio.run(_load())


def test_pattern_draft_is_pending_previewed_and_unapproved(client: TestClient):
    payload = _instantiate(client)
    change = payload["change"]
    assert change["status"] == "pending"
    assert change["base_rev"] == 1
    preview = change["preview"]
    assert preview["applies"] is True
    assert preview["validation"]["ok"] is True
    added = [d for d in preview["diff"] if d["kind"] == "added" and d["collection"] == "edges"]
    assert [d["id"] for d in added] == [PL_EDGE]
    # The proposal itself never approves anything.
    edge_ops = [op for op in change["change_set"]["ops"] if op["op"] == "add_edge"]
    assert all(op["edge"]["approved"] is False for op in edge_ops)
    # Runtime untouched until review.
    assert PL_EDGE not in get_runtime_config().graph_index["edges_by_id"]


@pytest.mark.parametrize("role", ["operator", "maintenance", "viewer", "agent"])
def test_only_engineers_can_review(client: TestClient, role: str):
    change_id = _instantiate(client)["change"]["change_id"]
    assert _review(client, change_id, role=role).status_code == 403


def test_review_requires_comment(client: TestClient):
    change_id = _instantiate(client)["change"]["change_id"]
    assert _review(client, change_id, comment="").status_code == 422


def test_approve_creates_revision_and_hot_deploys(client: TestClient):
    change_id = _instantiate(client)["change"]["change_id"]
    response = _review(client, change_id)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["change"]["status"] == "deployed"
    assert body["change"]["result_rev"] == 2
    assert body["change"]["reviewed_by"] == "engineer-reviewer"
    assert body["runtime"]["bundle_rev"] == 2

    config = get_runtime_config()
    assert config.bundle_rev == 2
    assert config.graph_index["edges_by_id"][PL_EDGE]["approved"] is True
    assert any(r.id == "MOTOR_CURRENT_HIGH" for r in config.alarm_rules)

    actions = _audit_actions()
    for expected in ("change.draft.create", "change.review.approve", "bundle.revision.create", "runtime.deploy"):
        assert expected in actions


def test_approve_without_edges_keeps_them_draft(client: TestClient):
    change_id = _instantiate(client)["change"]["change_id"]
    assert _review(client, change_id, approve_edges=False).status_code == 200
    assert get_runtime_config().graph_index["edges_by_id"][PL_EDGE]["approved"] is False


def test_reject_leaves_runtime_unchanged(client: TestClient):
    change_id = _instantiate(client)["change"]["change_id"]
    response = _review(client, change_id, decision="reject", comment="Relation already covered")
    assert response.status_code == 200
    assert response.json()["change"]["status"] == "rejected"
    assert get_runtime_config().bundle_rev is None
    assert "change.review.reject" in _audit_actions()


def test_stale_draft_is_refused_not_rebased(client: TestClient):
    first = _instantiate(client)["change"]["change_id"]
    second = _submit_edge(
        client,
        {"id": "E_EXTRA", "from": "BAT-101", "to": "INV-101", "edge_type": "structural_power",
         "approved": False, "lag_ms": [0, 800], "provenance": "engineer_entered"},
    )["change_id"]
    assert _review(client, first).status_code == 200
    response = _review(client, second)
    assert response.status_code == 409
    listed = client.get(f"/api/changes/{second}", headers=_auth(client, "viewer")).json()["change"]
    assert listed["status"] == "stale"


def test_invalid_change_is_blocked_and_stays_pending(client: TestClient):
    change = _submit_edge(
        client,
        {"id": "E_GHOST", "from": "MTR-301", "to": "GHOST-9", "edge_type": "cause_to_effect",
         "approved": False, "lag_ms": [0, 100], "provenance": "engineer_entered"},
    )
    assert change["preview"]["validation"]["ok"] is False
    response = _review(client, change["change_id"])
    assert response.status_code == 422
    listed = client.get(f"/api/changes/{change['change_id']}", headers=_auth(client, "viewer")).json()["change"]
    assert listed["status"] == "pending"
    assert listed["reviewed_by"] is None


def test_unflagged_cycle_cannot_be_deployed(client: TestClient):
    # BUS → MTR closes a loop with approved E5 (MTR → BUS), which is not loop_ok.
    change = _submit_edge(
        client,
        {"id": "E_BACK", "from": "BUS-101", "to": "MTR-301", "edge_type": "structural_power",
         "approved": False, "lag_ms": [0, 500], "loop_ok": True, "provenance": "engineer_entered"},
    )
    errors = change["preview"]["validation"]["compile_errors"]
    assert any("Cycle" in e["message"] and "E5" in e["message"] for e in errors)
    assert _review(client, change["change_id"]).status_code == 422


def test_rollback_redeploys_old_revision_as_new_revision(client: TestClient):
    change_id = _instantiate(client)["change"]["change_id"]
    assert _review(client, change_id).status_code == 200
    denied = client.post(
        "/api/changes/rollback", json={"to_rev": 1, "comment": "revert"}, headers=_auth(client, "engineer")
    )
    assert denied.status_code == 403
    response = client.post(
        "/api/changes/rollback",
        json={"to_rev": 1, "comment": "Edge caused false positives"},
        headers=_auth(client, "admin"),
    )
    assert response.status_code == 200, response.text
    assert response.json()["rev"] == 3
    assert PL_EDGE not in get_runtime_config().graph_index["edges_by_id"]
    revisions = client.get("/api/changes/revisions", headers=_auth(client, "viewer")).json()["revisions"]
    assert [r["rev"] for r in revisions] == [3, 2, 1]
    assert "runtime.rollback" in _audit_actions()


def test_agents_may_only_submit_agent_drafts(client: TestClient):
    ok = client.post(
        "/api/changes",
        json={"title": "Agent idea", "source": "agent", "ops": []},
        headers=_auth(client, "agent", "agent-bot"),
    )
    assert ok.status_code == 200
    spoofed = client.post(
        "/api/changes",
        json={"title": "Spoof", "source": "engineer", "ops": []},
        headers=_auth(client, "agent", "agent-bot"),
    )
    assert spoofed.status_code == 403


def test_disallowed_edit_field_is_rejected_in_preview(client: TestClient):
    response = client.post(
        "/api/changes",
        json={
            "title": "Sneaky provenance rewrite",
            "source": "engineer",
            "ops": [{"op": "update_edge", "edge_id": "E5", "fields": {"provenance": "hazop"}}],
        },
        headers=_auth(client, "engineer"),
    )
    preview = response.json()["change"]["preview"]
    assert preview["applies"] is False
    assert "not editable" in preview["error"]


def test_four_eyes_policy(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.settings import get_settings

    monkeypatch.setenv("CHANGE_REQUIRE_DISTINCT_REVIEWER", "true")
    get_settings.cache_clear()
    change_id = _instantiate(client)["change"]["change_id"]
    own = client.post(
        f"/api/changes/{change_id}/review",
        json={"decision": "approve", "comment": "self"},
        headers=_auth(client, "engineer", "eng-author"),
    )
    assert own.status_code == 403
    assert _review(client, change_id).status_code == 200


def test_audit_endpoint_lists_newest_first_and_verifies_chain(client: TestClient):
    change_id = _instantiate(client)["change"]["change_id"]
    assert _review(client, change_id).status_code == 200
    assert client.get("/api/audit", headers=_auth(client, "operator")).status_code == 403
    body = client.get("/api/audit", params={"action": "change."}, headers=_auth(client, "engineer")).json()
    assert body["chain"]["valid"] is True
    actions = [r["action"] for r in body["records"]]
    assert actions[0] == "change.review.approve" and actions[-1] == "change.draft.create"
