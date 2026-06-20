"""Integration tests for /api/offline-ingest routes."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.settings import get_settings

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "ingest"

EXPECTED_PHYSICAL_DEMO_TAGS = {
    "CHG_SOLAR_OUT_V",
    "CHG_SOLAR_OUT_I",
    "CHG_SOLAR_OUT_P",
    "CHG_MAINS_OUT_V",
    "CHG_MAINS_OUT_I",
    "CHG_MAINS_OUT_P",
    "BAT_24V_V",
    "BAT_24V_I",
    "BAT_24V_P",
    "INV_AC_OUT_V",
    "INV_AC_OUT_I",
    "INV_AC_OUT_P",
    "VFD_OUT_V",
    "VFD_OUT_I",
    "VFD_OUT_P",
    "MTR_FHP_SPEED",
    "MTR_FHP_VIB",
    "MTR_FHP_TEMP",
}


def _auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _engineer_token(client: TestClient) -> str:
    response = client.post(
        "/internal/auth-test/dev-token",
        json={"role": "engineer", "subject": "offline-ingest-test"},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def _viewer_token(client: TestClient) -> str:
    response = client.post(
        "/internal/auth-test/dev-token",
        json={"role": "viewer", "subject": "offline-viewer-test"},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def _upload_fixture(
    client: TestClient,
    *,
    fixture_name: str,
    token: str,
) -> dict[str, object]:
    fixture_path = FIXTURES_DIR / fixture_name
    with fixture_path.open("rb") as handle:
        response = client.post(
            "/api/offline-ingest/uploads",
            files={"file": (fixture_name, handle, "text/csv")},
            headers=_auth_header(token),
        )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture(autouse=True)
def isolated_offline_ingest_store(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OFFLINE_INGEST_DATA_DIR", str(tmp_path / "offline-ingest"))
    get_settings.cache_clear()


def test_upload_physical_demo_signal_list_creates_run(client: TestClient):
    token = _engineer_token(client)
    start = _upload_fixture(
        client,
        fixture_name="physical_demo_signal_list.csv",
        token=token,
    )
    assert str(start["run_id"]).startswith("run_")
    assert str(start["artifact_id"]).startswith("art_")
    assert start["document_kind"] == "signal_list"

    viewer = _viewer_token(client)
    report_response = client.get(
        f"/api/offline-ingest/runs/{start['run_id']}/report",
        headers=_auth_header(viewer),
    )
    assert report_response.status_code == 200
    report = report_response.json()
    assert report["totals"]["drafts_created"] == 18
    assert report["downstream_ready_for_studio"] is True

    drafts_response = client.get(
        f"/api/offline-ingest/runs/{start['run_id']}/drafts",
        headers=_auth_header(viewer),
    )
    assert drafts_response.status_code == 200
    drafts = drafts_response.json()["drafts"]
    assert len(drafts) == 18
    assert all(draft["requires_human_approval"] for draft in drafts)
    tag_ids = {draft["payload"]["tag"]["tag_id"] for draft in drafts}
    assert tag_ids == EXPECTED_PHYSICAL_DEMO_TAGS


def test_upload_missing_unit_creates_quarantine_and_partial_report(client: TestClient):
    token = _engineer_token(client)
    start = _upload_fixture(
        client,
        fixture_name="physical_demo_signal_list_missing_unit.csv",
        token=token,
    )

    viewer = _viewer_token(client)
    report = client.get(
        f"/api/offline-ingest/runs/{start['run_id']}/report",
        headers=_auth_header(viewer),
    ).json()
    assert report["status"] == "partial"
    assert report["downstream_ready_for_studio"] is False

    quarantine = client.get(
        f"/api/offline-ingest/runs/{start['run_id']}/quarantine",
        headers=_auth_header(viewer),
    ).json()["quarantine"]
    assert quarantine
    assert all(entry["suggested_fix"] for entry in quarantine)
    assert all(entry["source_ref"] for entry in quarantine)


def test_upload_unknown_document_requires_human_label_or_review(client: TestClient):
    token = _engineer_token(client)
    start = _upload_fixture(
        client,
        fixture_name="unknown_document.csv",
        token=token,
    )
    assert start["document_kind"] == "unknown"

    viewer = _viewer_token(client)
    report = client.get(
        f"/api/offline-ingest/runs/{start['run_id']}/report",
        headers=_auth_header(viewer),
    ).json()
    assert report["totals"]["drafts_created"] == 0
    assert report["downstream_ready_for_studio"] is False

    quarantine = client.get(
        f"/api/offline-ingest/runs/{start['run_id']}/quarantine",
        headers=_auth_header(viewer),
    ).json()["quarantine"]
    assert any(entry["reason"] == "manual_review_required" for entry in quarantine)


def test_upload_register_map_creates_register_drafts(client: TestClient):
    token = _engineer_token(client)
    start = _upload_fixture(
        client,
        fixture_name="physical_demo_register_map.csv",
        token=token,
    )
    assert start["document_kind"] == "register_map"

    viewer = _viewer_token(client)
    drafts = client.get(
        f"/api/offline-ingest/runs/{start['run_id']}/drafts",
        headers=_auth_header(viewer),
    ).json()["drafts"]
    register_drafts = [draft for draft in drafts if draft["draft_type"] == "register_map_draft"]
    assert len(register_drafts) >= 3
    assert all(
        draft["payload"]["register_map"]["register"]["address"]
        for draft in register_drafts
    )


def test_get_unknown_run_returns_404(client: TestClient):
    viewer = _viewer_token(client)
    response = client.get(
        "/api/offline-ingest/runs/run_does_not_exist/report",
        headers=_auth_header(viewer),
    )
    assert response.status_code == 404


def test_text_endpoint_accepts_csv_text(client: TestClient):
    token = _engineer_token(client)
    csv_text = (FIXTURES_DIR / "physical_demo_signal_list.csv").read_text(encoding="utf-8")
    response = client.post(
        "/api/offline-ingest/text",
        json={"text": csv_text, "filename": "physical_demo_signal_list.csv"},
        headers=_auth_header(token),
    )
    assert response.status_code == 200, response.text
    start = response.json()

    viewer = _viewer_token(client)
    report = client.get(
        f"/api/offline-ingest/runs/{start['run_id']}/report",
        headers=_auth_header(viewer),
    ).json()
    assert report["totals"]["drafts_created"] == 18


def test_offline_ingest_does_not_accept_gateway_token_only(client: TestClient):
    fixture_path = FIXTURES_DIR / "physical_demo_signal_list.csv"
    with fixture_path.open("rb") as handle:
        response = client.post(
            "/api/offline-ingest/uploads",
            files={"file": ("physical_demo_signal_list.csv", handle, "text/csv")},
            headers={"Authorization": "Bearer change-me"},
        )
    assert response.status_code == 401


def test_live_gateway_ingest_still_registered(client: TestClient):
    response = client.post("/api/ingest/frame", json={})
    assert response.status_code in {401, 422}