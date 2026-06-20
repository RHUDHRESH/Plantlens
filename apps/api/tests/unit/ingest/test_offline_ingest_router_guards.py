"""Static guard tests for offline ingest router boundaries."""

from __future__ import annotations

from pathlib import Path

from app.routers import offline_ingest

API_ROOT = Path(__file__).resolve().parents[3]


def test_offline_router_prefix_is_separate():
    assert offline_ingest.router.prefix == "/api/offline-ingest"


def test_offline_router_does_not_import_runtime_gateway():
    source = (API_ROOT / "app" / "routers" / "offline_ingest.py").read_text(encoding="utf-8")
    assert "get_simulator_gateway" not in source
    assert "runtime_state" not in source
    assert "verify_gateway_ingest_token" not in source
    assert "app.routers.ingest" not in source


def test_pipeline_does_not_import_runtime_gateway():
    source = (API_ROOT / "app" / "ingest" / "pipeline.py").read_text(encoding="utf-8")
    assert "get_simulator_gateway" not in source
    assert "runtime_state" not in source
    assert "app.routers.ingest" not in source


def test_no_auto_approval_literals_in_offline_router():
    source = (API_ROOT / "app" / "routers" / "offline_ingest.py").read_text(encoding="utf-8")
    assert "requires_human_approval=False" not in source
    assert 'status="approved' not in source
    assert 'approval_status="APPROVED"' not in source