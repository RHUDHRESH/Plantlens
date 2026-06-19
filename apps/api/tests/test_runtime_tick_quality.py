"""Quality normalization wired into runtime tick."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.runtime.config_loader import load_runtime_config
from app.runtime.runtime_state import RuntimeState
from app.runtime.runtime_tick import evaluate_runtime_tick, normalize_tag_quality
from app.schemas.tag_frame import TagFrame

REPO_ROOT = Path(__file__).resolve().parents[3]
DEMO_DIR = REPO_ROOT / "packages" / "sample-data" / "demo-microgrid"
TS = datetime(2026, 6, 18, 12, 0, 0, tzinfo=timezone.utc)


def test_stale_gateway_frame_normalized_on_tick():
    config = load_runtime_config("demo", sample_data_dir=DEMO_DIR)
    state = RuntimeState()
    frame = TagFrame(
        tag_id="MOTOR_301_CURRENT",
        asset_id="MTR-301",
        value=1.2,
        unit="A",
        quality="GOOD",
        timestamp=TS,
        source="modbus_rtu",
        ingest_ts=TS,
    )
    state.update_tag(frame)
    later = TS + timedelta(seconds=2)
    evaluate_runtime_tick(state, config, now=later)
    refreshed = state.get_tag("MOTOR_301_CURRENT")
    assert refreshed is not None
    assert refreshed.quality == "STALE"


def test_normalize_incoming_bad_quality():
    config = load_runtime_config("demo", sample_data_dir=DEMO_DIR)
    state = RuntimeState()
    frame = TagFrame(
        tag_id="MOTOR_301_CURRENT",
        asset_id="MTR-301",
        value=1.2,
        unit="A",
        quality="BAD",
        timestamp=TS,
        source="simulator",
    )
    normalized = normalize_tag_quality(frame, config, state, now=TS)
    assert normalized.quality == "BAD"