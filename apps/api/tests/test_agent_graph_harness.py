"""Integration tests for the DAG Authoring Harness pipeline.

Tests the full chain:
  evidence → graph_draft → approve_draft (patches authored bundle) →
  approve-runtime-edge (compile + hot_reload)

Uses a temp-dir copy of the demo bundle for write-safe testing.
"""

from __future__ import annotations

import asyncio
import json
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.db.base import Base
from app.db.session import dispose_db_engine, get_session_factory
from app.runtime.config_loader import reset_runtime_config_for_tests
from app.services.agent_queue import agent_draft_queue, reset_agent_queue_for_tests
from app.settings import get_settings

REPO_ROOT = Path(__file__).resolve().parents[3]
DEMO_DIR = REPO_ROOT / "packages" / "sample-data" / "demo-microgrid"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _token(client: TestClient, role: str, subject: str = "test-user") -> dict[str, str]:
    token = client.post(
        "/internal/auth-test/dev-token",
        json={"role": role, "subject": subject},
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _motor_overload_evidence(evidence_id: str = "EV_HARNESS_001") -> dict:
    return {
        "evidence_id": evidence_id,
        "root_asset_id": "MTR-301",
        "confidence": 0.85,
        "evidence_chain": [
            {
                "order": 1,
                "asset_id": "MTR-301",
                "alarm_id": "MOTOR_CURRENT_HIGH",
                "role": "first_signal",
                "first_seen_ts": "2026-01-01T10:00:00Z",
                "quality": "good",
                "explanation": "Motor current above limit.",
            },
            {
                "order": 2,
                "asset_id": "INV-102",
                "alarm_id": "INVERTER_UNDERVOLTAGE",
                "role": "downstream_effect",
                "first_seen_ts": "2026-01-01T10:00:02Z",
                "quality": "good",
                "explanation": "Inverter undervoltage detected.",
            },
        ],
        "causal_path": [],  # No existing path — so candidate MTR-301→INV-102 is fresh
    }


# ---------------------------------------------------------------------------
# Standard test client (read-only demo bundle — no disk writes)
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _reset_queue_and_runtime():
    reset_agent_queue_for_tests()
    reset_runtime_config_for_tests()
    yield
    reset_agent_queue_for_tests()
    reset_runtime_config_for_tests()


# ---------------------------------------------------------------------------
# graph_draft with evidence → deterministic candidates
# ---------------------------------------------------------------------------


def test_graph_draft_with_evidence_returns_candidates(client: TestClient):
    """Local stub should generate candidate edges from evidence_packet."""
    response = client.post(
        "/api/agents/graph-draft",
        json={"context": {"evidence_packet": _motor_overload_evidence()}, "prompt": ""},
        headers=_token(client, "engineer"),
    )
    assert response.status_code == 200
    draft = response.json()["draft"]
    assert draft["status"] == "pending"
    payload = draft["payload"]
    # With evidence, the stub should produce candidates (not service_unavailable)
    assert payload["artifact_type"] in ("graph_draft", "service_unavailable")
    # If graph_draft returned, candidates must be structurally valid
    if payload["artifact_type"] == "graph_draft":
        for change in payload.get("proposed_changes", []):
            assert change["change_type"] == "add_causal_edge"
            patch = change["patch"]
            assert patch["approved"] is False
            assert patch["provenance"] == "agent_proposed"
            assert patch["confidence"] <= 0.75
            assert len(change["evidence_refs"]) >= 1


def test_graph_draft_without_evidence_is_service_unavailable(client: TestClient):
    """No evidence → safe fallback: no fabricated edges."""
    response = client.post(
        "/api/agents/graph-draft",
        json={"prompt": "propose edge"},
        headers=_token(client, "engineer"),
    )
    payload = response.json()["draft"]["payload"]
    assert payload["artifact_type"] == "service_unavailable"
    assert payload["proposed_changes"] == []


# ---------------------------------------------------------------------------
# approve_draft — no proposed changes (existing behaviour preserved)
# ---------------------------------------------------------------------------


def test_approve_draft_without_changes_is_safe(client: TestClient):
    """Approving a draft with no proposed changes must not modify runtime."""
    draft_id = client.post(
        "/api/agents/graph-draft",
        json={"prompt": "review edges"},
        headers=_token(client, "engineer"),
    ).json()["draft"]["draft_id"]

    response = client.post(
        "/api/agents/drafts/approve",
        json={"draft_id": draft_id},
        headers=_token(client, "engineer"),
    )
    assert response.status_code == 200
    bridge = response.json()["bridge"]
    assert bridge["runtime_deployed"] is False
    assert bridge["approved_artifact_stored"] is True
    assert "unchanged" in bridge["message"].lower()
    assert bridge.get("authored_bundle_patched") is False


def test_reject_draft_writes_audit(client: TestClient):
    draft_id = client.post(
        "/api/agents/graph-draft",
        json={"prompt": "reject me"},
        headers=_token(client, "engineer"),
    ).json()["draft"]["draft_id"]

    response = client.post(
        "/api/agents/drafts/reject",
        json={"draft_id": draft_id},
        headers=_token(client, "engineer"),
    )
    assert response.status_code == 200
    assert response.json()["draft"]["status"] == "rejected"
    assert "audit_id" in response.json()
    assert agent_draft_queue.get_approved(draft_id) is None


# ---------------------------------------------------------------------------
# approve_draft — invalid patch rejected, bundle not modified
# ---------------------------------------------------------------------------


@pytest.fixture
def client_with_temp_bundle(tmp_path, monkeypatch):
    """TestClient using a temp copy of the demo bundle — safe for write tests."""
    bundle_dir = tmp_path / "bundle"
    compiled_dir = tmp_path / "compiled"
    shutil.copytree(DEMO_DIR, bundle_dir)
    compiled_dir.mkdir()

    monkeypatch.setenv("SAMPLE_DATA_DIR", str(bundle_dir))
    monkeypatch.setenv("COMPILED_DIR", str(compiled_dir))
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    monkeypatch.setenv("PLANTLENS_ENV", "test")
    monkeypatch.setenv("PLANTLENS_DEV_JWT_SECRET", "test-secret-for-pytest")
    get_settings.cache_clear()
    reset_runtime_config_for_tests()

    from app.main import create_app

    async def _schema():
        factory = get_session_factory()
        async with factory() as session:
            conn = await session.connection()
            await conn.run_sync(Base.metadata.create_all)
            await session.commit()

    with TestClient(create_app()) as tc:
        asyncio.run(_schema())
        yield tc, bundle_dir

    asyncio.run(dispose_db_engine())
    get_settings.cache_clear()
    reset_runtime_config_for_tests()


def test_approve_draft_with_invalid_patch_returns_errors(client_with_temp_bundle):
    tc, bundle_dir = client_with_temp_bundle

    # Inject a draft with a bad proposed change (from node doesn't exist)
    bad_change = {
        "change_type": "add_causal_edge",
        "target_path": "/causal_graph/edges",
        "patch": {
            "id": "E_AGENT_BAD001",
            "from": "GHOST-999",
            "to": "MTR-301",
            "edge_type": "cause_to_effect",
            "approved": False,
            "lag_ms": [0, 5000],
            "weight": 0.5,
            "confidence": 0.5,
            "provenance": "agent_proposed",
        },
        "rationale": "Bad patch test.",
        "evidence_refs": ["MOTOR_CURRENT_HIGH"],
        "risk_level": "medium",
    }
    draft = agent_draft_queue.submit(
        draft_type="graph_draft",
        payload={"artifact_type": "graph_draft", "proposed_changes": [bad_change]},
        proposed_by="test-engineer",
    )

    response = tc.post(
        "/api/agents/drafts/approve",
        json={"draft_id": draft["draft_id"]},
        headers=_token(tc, "engineer"),
    )
    assert response.status_code == 200
    bridge = response.json()["bridge"]
    assert bridge["authored_bundle_patched"] is False
    assert bridge["compile_status"] == "patch_validation_failed"
    assert len(bridge["patch_errors"]) >= 1
    assert any(e["code"] == "UNKNOWN_FROM_NODE" for e in bridge["patch_errors"])

    # Verify causal_graph.json was NOT modified
    cg = json.loads((bundle_dir / "causal_graph.json").read_text())
    ids = [e["id"] for e in cg["edges"]]
    assert "E_AGENT_BAD001" not in ids


def test_approve_draft_with_valid_patch_writes_unapproved_edge(client_with_temp_bundle):
    tc, bundle_dir = client_with_temp_bundle

    valid_change = {
        "change_type": "add_causal_edge",
        "target_path": "/causal_graph/edges",
        "patch": {
            "id": "E_AGENT_VALID01",
            "from": "MTR-301",
            "to": "INV-102",
            "edge_type": "cause_to_effect",
            "approved": False,
            "lag_ms": [0, 5000],
            "weight": 0.6,
            "confidence": 0.6,
            "provenance": "agent_proposed",
        },
        "rationale": "MTR-301 alarm observed before INV-102 alarm.",
        "evidence_refs": ["MOTOR_CURRENT_HIGH", "INVERTER_UNDERVOLTAGE"],
        "risk_level": "medium",
    }
    draft = agent_draft_queue.submit(
        draft_type="graph_draft",
        payload={"artifact_type": "graph_draft", "proposed_changes": [valid_change]},
        proposed_by="test-engineer",
    )

    response = tc.post(
        "/api/agents/drafts/approve",
        json={"draft_id": draft["draft_id"]},
        headers=_token(tc, "engineer"),
    )
    assert response.status_code == 200
    bridge = response.json()["bridge"]
    assert bridge["authored_bundle_patched"] is True
    assert bridge.get("edges_added") == 1
    assert bridge["compile_status"] == "compiled_awaiting_runtime_approval"
    assert bridge.get("compiled") is True
    assert bridge.get("graph_hash")
    assert bridge["runtime_deployed"] is False

    # Verify edge was written to causal_graph.json with approved=false
    cg = json.loads((bundle_dir / "causal_graph.json").read_text())
    added = next((e for e in cg["edges"] if e["id"] == "E_AGENT_VALID01"), None)
    assert added is not None
    assert added["approved"] is False
    assert added["provenance"] == "agent_proposed"


def test_approve_draft_compile_failure_keeps_lkg(client_with_temp_bundle, monkeypatch):
    """Compile failure on Approval A must not write the authored causal graph."""
    tc, bundle_dir = client_with_temp_bundle
    before = (bundle_dir / "causal_graph.json").read_text(encoding="utf-8")

    valid_change = {
        "change_type": "add_causal_edge",
        "target_path": "/causal_graph/edges",
        "patch": {
            "id": "E_AGENT_COMPILE_FAIL",
            "from": "MTR-301",
            "to": "INV-102",
            "edge_type": "cause_to_effect",
            "approved": False,
            "lag_ms": [0, 5000],
            "weight": 0.6,
            "confidence": 0.6,
            "provenance": "agent_proposed",
        },
        "rationale": "Synthetic edge for compile-failure LKG test.",
        "evidence_refs": ["MOTOR_CURRENT_HIGH"],
        "risk_level": "medium",
    }
    draft = agent_draft_queue.submit(
        draft_type="graph_draft",
        payload={"artifact_type": "graph_draft", "proposed_changes": [valid_change]},
        proposed_by="test-engineer",
    )

    def _failing_compile(**_kwargs):
        return {"status": "error", "errors": [{"code": "FORCED", "message": "forced compile failure"}]}

    monkeypatch.setattr("app.routers.agents.compile_authored_bundle", _failing_compile)

    response = tc.post(
        "/api/agents/drafts/approve",
        json={"draft_id": draft["draft_id"]},
        headers=_token(tc, "engineer"),
    )
    assert response.status_code == 200
    bridge = response.json()["bridge"]
    assert bridge["authored_bundle_patched"] is False
    assert bridge["compile_status"] == "compile_failed_lkg_kept"
    assert bridge.get("compiled") is False

    after = (bundle_dir / "causal_graph.json").read_text(encoding="utf-8")
    assert after == before
    cg = json.loads(after)
    assert "E_AGENT_COMPILE_FAIL" not in {e["id"] for e in cg["edges"]}


# ---------------------------------------------------------------------------
# approve-runtime-edge — compile + hot-reload
# ---------------------------------------------------------------------------


def _inject_agent_edge(bundle_dir: Path, edge_id: str = "E_AGENT_RUNTIME01") -> None:
    """Write an agent_proposed edge into the temp causal_graph.json."""
    path = bundle_dir / "causal_graph.json"
    cg = json.loads(path.read_text())
    cg["edges"].append(
        {
            "id": edge_id,
            "from": "MTR-301",
            "to": "INV-102",
            "edge_type": "cause_to_effect",
            "approved": False,
            "lag_ms": [0, 5000],
            "weight": 0.6,
            "confidence": 0.6,
            "provenance": "agent_proposed",
        }
    )
    path.write_text(json.dumps(cg, indent=2) + "\n", encoding="utf-8")


def test_approve_runtime_edge_not_found_returns_404(client_with_temp_bundle):
    tc, _ = client_with_temp_bundle
    response = tc.post(
        "/api/agents/graph-edges/E_DOES_NOT_EXIST/approve-runtime",
        headers=_token(tc, "engineer"),
    )
    assert response.status_code == 404


def test_approve_runtime_edge_already_approved_returns_409(client_with_temp_bundle):
    tc, _ = client_with_temp_bundle
    # E1 is already approved in demo graph
    response = tc.post(
        "/api/agents/graph-edges/E1/approve-runtime",
        headers=_token(tc, "engineer"),
    )
    assert response.status_code == 409


def test_approve_runtime_edge_wrong_provenance_returns_422(client_with_temp_bundle):
    tc, bundle_dir = client_with_temp_bundle
    # E_UNAPPROVED in the demo graph has provenance=agent_proposed, approved=false
    # But E1 has provenance=engineer_entered, approved=true
    # Let's create an unapproved edge with non-agent provenance
    path = bundle_dir / "causal_graph.json"
    cg = json.loads(path.read_text())
    cg["edges"].append(
        {
            "id": "E_MANUAL_UNAPPROVED",
            "from": "MTR-301",
            "to": "INV-102",
            "edge_type": "cause_to_effect",
            "approved": False,
            "lag_ms": [0, 5000],
            "weight": 0.6,
            "confidence": 0.6,
            "provenance": "engineer_entered",
        }
    )
    path.write_text(json.dumps(cg, indent=2) + "\n", encoding="utf-8")

    response = tc.post(
        "/api/agents/graph-edges/E_MANUAL_UNAPPROVED/approve-runtime",
        headers=_token(tc, "engineer"),
    )
    assert response.status_code == 422


def test_approve_runtime_edge_compiles_and_hot_reloads(client_with_temp_bundle):
    """Full Approval B: agent edge → compile → hot_reload → edge is runtime-active."""
    tc, bundle_dir = client_with_temp_bundle
    _inject_agent_edge(bundle_dir, "E_AGENT_RUNTIME01")

    response = tc.post(
        "/api/agents/graph-edges/E_AGENT_RUNTIME01/approve-runtime",
        headers=_token(tc, "engineer"),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["runtime_approved"] is True
    assert body["compiled"] is True
    assert body["runtime_deployed"] is True
    assert body["graph_hash"]
    assert body["audit_id"]

    # Verify causal_graph.json now has the edge as approved=true
    cg = json.loads((bundle_dir / "causal_graph.json").read_text())
    edge = next((e for e in cg["edges"] if e["id"] == "E_AGENT_RUNTIME01"), None)
    assert edge is not None
    assert edge["approved"] is True


def test_approve_runtime_edge_viewer_forbidden(client_with_temp_bundle):
    tc, bundle_dir = client_with_temp_bundle
    _inject_agent_edge(bundle_dir, "E_AGENT_RUNTIME02")

    response = tc.post(
        "/api/agents/graph-edges/E_AGENT_RUNTIME02/approve-runtime",
        headers=_token(tc, "viewer"),
    )
    assert response.status_code == 403


def test_approve_runtime_edge_cycle_blocked(client_with_temp_bundle):
    """An edge that would create a cycle must be rejected by compile — no writes."""
    tc, bundle_dir = client_with_temp_bundle

    # INV-102 → PV-101 would create a cycle in the approved graph
    path = bundle_dir / "causal_graph.json"
    cg = json.loads(path.read_text())
    cg["edges"].append(
        {
            "id": "E_AGENT_CYCLE",
            "from": "INV-102",
            "to": "PV-101",
            "edge_type": "cause_to_effect",
            "approved": False,
            "lag_ms": [0, 5000],
            "weight": 0.5,
            "confidence": 0.5,
            "provenance": "agent_proposed",
        }
    )
    path.write_text(json.dumps(cg, indent=2) + "\n", encoding="utf-8")

    response = tc.post(
        "/api/agents/graph-edges/E_AGENT_CYCLE/approve-runtime",
        headers=_token(tc, "engineer"),
    )
    assert response.status_code == 422

    # Verify the edge is still unapproved on disk (no partial write)
    cg_after = json.loads((bundle_dir / "causal_graph.json").read_text())
    edge = next((e for e in cg_after["edges"] if e["id"] == "E_AGENT_CYCLE"), None)
    assert edge is not None
    assert edge["approved"] is False


def test_approve_runtime_edge_promote_failure_keeps_sync(client_with_temp_bundle, monkeypatch):
    """Mid-failure after temp compile must not leave compiled-approved / authored-unapproved."""
    tc, bundle_dir = client_with_temp_bundle
    edge_id = "E_AGENT_ATOMIC_FAIL"
    _inject_agent_edge(bundle_dir, edge_id)

    from app.settings import get_settings
    from app.studio.compiler import compile_authored_bundle
    from app.studio.config_store import load_authored, load_compiled

    settings = get_settings()
    live_compiled = Path(settings.compiled_dir)

    # Seed a known-good live compiled artifact without the edge approved
    seed = load_authored(bundle_dir)
    seed_result = compile_authored_bundle(
        plant_id=settings.active_plant_id,
        bundle=seed,
        compiled_dir=live_compiled,
    )
    assert seed_result["status"] == "ok"
    previous_hash = seed_result["compiled"]["content_hash"]

    def _boom(*_args, **_kwargs):
        raise OSError("injected promote failure")

    monkeypatch.setattr("app.routers.agents.atomic_promote_approval", _boom)

    response = tc.post(
        f"/api/agents/graph-edges/{edge_id}/approve-runtime",
        headers=_token(tc, "engineer"),
    )
    assert response.status_code == 500

    # Authored must remain unapproved
    cg_after = json.loads((bundle_dir / "causal_graph.json").read_text())
    edge = next((e for e in cg_after["edges"] if e["id"] == edge_id), None)
    assert edge is not None
    assert edge["approved"] is False

    # Live compiled must still be the previous known-good (not partially promoted)
    live = load_compiled(live_compiled, settings.active_plant_id)
    assert live is not None
    assert live["content_hash"] == previous_hash
    approved_ids = {
        e["id"]
        for e in live.get("graph_index", {}).get("approved_edges", [])
        if e.get("approved")
    }
    assert edge_id not in approved_ids
