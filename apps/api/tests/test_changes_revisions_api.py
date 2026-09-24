"""Revision snapshot + revision diff endpoints (read-only views over immutable revisions)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.runtime.alarm_engine import reset_alarm_engine_state
from app.runtime.config_loader import reset_runtime_config_for_tests

PATTERN = "induction_motor.mechanical_overload"


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


def _approve_pattern_change(client: TestClient) -> dict:
    submitted = client.post(
        f"/api/library/patterns/{PATTERN}/instantiate",
        json={"asset_id": "MTR-301", "submit": True},
        headers=_auth(client, "engineer", "eng-author"),
    )
    assert submitted.status_code == 200, submitted.text
    change_id = submitted.json()["change"]["change_id"]
    reviewed = client.post(
        f"/api/changes/{change_id}/review",
        json={"decision": "approve", "comment": "Checked against P&ID", "approve_edges": True},
        headers=_auth(client, "engineer", "eng-reviewer"),
    )
    assert reviewed.status_code == 200, reviewed.text
    return reviewed.json()["change"]


def test_revision_bundle_returns_snapshot_and_summary(client: TestClient):
    change = _approve_pattern_change(client)
    assert change["result_rev"] == 2
    response = client.get("/api/changes/revisions/2", headers=_auth(client, "engineer"))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["revision"]["rev"] == 2
    assert body["revision"]["parent_rev"] == 1
    assert body["revision"]["source_change_id"] == change["change_id"]
    assert body["revision"]["deployed_by"] == "eng-reviewer"
    assert {"causal_graph", "alarm_rules", "plant", "tag_map"} <= set(body["bundle"])
    edge_ids = {e["id"] for e in body["bundle"]["causal_graph"]["edges"]}
    assert "PL-MTR-301-INV-102" in edge_ids


def test_revision_diff_against_parent_lists_added_entities(client: TestClient):
    _approve_pattern_change(client)
    response = client.get("/api/changes/revisions/1/diff/2", headers=_auth(client, "admin"))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["from"]["rev"] == 1 and body["to"]["rev"] == 2
    assert body["identical"] is False
    kinds = {(d["collection"], d["kind"]) for d in body["diff"]}
    assert ("edges", "added") in kinds
    assert ("nodes", "changed") in kinds  # evidence merged into the existing motor node
    assert ("situation_types", "added") in kinds
    added_edge = next(d for d in body["diff"] if d["collection"] == "edges" and d["kind"] == "added")
    assert added_edge["after"]["approved"] is True  # reviewer admitted edges


def test_revision_diff_is_symmetric_and_rollback_is_identical_to_target(client: TestClient):
    _approve_pattern_change(client)
    rolled = client.post(
        "/api/changes/rollback", json={"to_rev": 1, "comment": "Revert to seed"}, headers=_auth(client, "admin")
    )
    assert rolled.status_code == 200, rolled.text
    assert rolled.json()["rev"] == 3
    reverse = client.get("/api/changes/revisions/2/diff/3", headers=_auth(client, "engineer")).json()
    reverse_kinds = {(d["collection"], d["kind"]) for d in reverse["diff"]}
    assert ("edges", "removed") in reverse_kinds
    assert ("edges", "added") not in reverse_kinds
    same = client.get("/api/changes/revisions/1/diff/3", headers=_auth(client, "engineer")).json()
    assert same["identical"] is True
    assert same["diff"] == []


def test_unknown_revision_returns_structured_404(client: TestClient):
    # Seed revision 1 exists after the first pipeline touch.
    client.get("/api/library/patterns/coverage/MTR-301", headers=_auth(client, "engineer"))
    response = client.get("/api/changes/revisions/99", headers=_auth(client, "engineer"))
    assert response.status_code == 404
    detail = response.json()["detail"]
    assert detail["code"] == "revision_not_found"
    assert "fix" in detail
    diff = client.get("/api/changes/revisions/1/diff/99", headers=_auth(client, "engineer"))
    assert diff.status_code == 404


@pytest.mark.parametrize("role", ["viewer", "operator", "maintenance"])
def test_revision_bundle_requires_engineer(client: TestClient, role: str):
    client.get("/api/library/patterns/coverage/MTR-301", headers=_auth(client, "engineer"))
    assert client.get("/api/changes/revisions/1", headers=_auth(client, role)).status_code == 403
    assert client.get("/api/changes/revisions/1/diff/1", headers=_auth(client, role)).status_code == 403
