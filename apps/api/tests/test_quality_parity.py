"""Simulator + gateway quality parity under shared dropout/stale policy."""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.runtime.config_loader import load_runtime_config
from app.runtime.quality import normalize_quality_reading
from app.runtime.runtime_state import RuntimeState
from app.runtime.runtime_tick import normalize_tag_quality
from app.schemas.tag_frame import TagFrame

REPO_ROOT = Path(__file__).resolve().parents[3]
DEMO_DIR = REPO_ROOT / "packages" / "sample-data" / "demo-microgrid"
GATEWAY_ROOT = REPO_ROOT / "apps" / "gateway"
TS = datetime(2026, 6, 18, 12, 0, 0, tzinfo=timezone.utc)

# Import gateway quality mirror (same classify rules as API).
if str(GATEWAY_ROOT) not in sys.path:
    sys.path.insert(0, str(GATEWAY_ROOT))
from gateway.quality import normalize_quality_reading as gateway_normalize  # noqa: E402


POLICY = {"stale_after_ms": 1500, "missing_after_ms": 5000}


def test_shared_normalizer_stale_and_missing_parity():
    """Under identical policy, API + gateway normalizers agree on STALE/MISSING."""
    stale_now = TS + timedelta(milliseconds=2000)
    missing_now = TS + timedelta(milliseconds=6000)

    api_stale = normalize_quality_reading(
        value=1.2,
        raw_quality="GOOD",
        timestamp=TS,
        now=stale_now,
        quality_policy=POLICY,
    )
    gw_stale = gateway_normalize(
        value=1.2,
        raw_quality="GOOD",
        timestamp=TS,
        now=stale_now,
        quality_policy=POLICY,
    )
    assert api_stale.quality == "STALE"
    assert gw_stale.quality == "STALE"

    api_missing = normalize_quality_reading(
        value=1.2,
        raw_quality="GOOD",
        timestamp=TS,
        now=missing_now,
        quality_policy=POLICY,
    )
    gw_missing = gateway_normalize(
        value=1.2,
        raw_quality="GOOD",
        timestamp=TS,
        now=missing_now,
        quality_policy=POLICY,
    )
    assert api_missing.quality == "MISSING"
    assert gw_missing.quality == "MISSING"

    api_none = normalize_quality_reading(
        value=None,
        raw_quality="GOOD",
        timestamp=TS,
        now=TS,
        quality_policy=POLICY,
    )
    gw_none = gateway_normalize(
        value=None,
        raw_quality="GOOD",
        timestamp=TS,
        now=TS,
        quality_policy=POLICY,
    )
    assert api_none.quality == "MISSING"
    assert gw_none.quality == "MISSING"


def test_sim_and_gateway_emitters_agree_via_normalize_tag_quality():
    """Dropout/stale policy applied through runtime path matches gateway stamp."""
    config = load_runtime_config("demo", sample_data_dir=DEMO_DIR)
    state = RuntimeState()
    later = TS + timedelta(seconds=2)

    # Gateway-style: age from ingest_ts / timestamp with modbus source
    gateway_frame = TagFrame(
        tag_id="MOTOR_301_CURRENT",
        asset_id="MTR-301",
        value=1.2,
        unit="A",
        quality="GOOD",
        timestamp=TS,
        source="modbus_rtu",
        ingest_ts=TS,
    )
    gw_norm = normalize_tag_quality(gateway_frame, config, state, now=later)

    # Explicit STALE emit from simulator fault path — classifier preserves STALE
    sim_frame = TagFrame(
        tag_id="MOTOR_301_CURRENT",
        asset_id="MTR-301",
        value=None,
        unit="A",
        quality="STALE",
        timestamp=later,
        source="simulator",
    )
    sim_norm = normalize_tag_quality(sim_frame, config, state, now=later)

    # Age-based gateway path → STALE; explicit sim STALE → STALE
    assert gw_norm.quality == "STALE"
    assert sim_norm.quality == "STALE"

    # MISSING parity: null value / long dropout
    missing_now = TS + timedelta(seconds=6)
    gw_missing_frame = TagFrame(
        tag_id="MOTOR_301_CURRENT",
        asset_id="MTR-301",
        value=1.2,
        unit="A",
        quality="GOOD",
        timestamp=TS,
        source="modbus_rtu",
        ingest_ts=TS,
    )
    assert (
        normalize_tag_quality(gw_missing_frame, config, state, now=missing_now).quality
        == "MISSING"
    )

    sim_missing = TagFrame(
        tag_id="MOTOR_301_CURRENT",
        asset_id="MTR-301",
        value=None,
        unit="A",
        quality="MISSING",
        timestamp=missing_now,
        source="simulator",
    )
    assert normalize_tag_quality(sim_missing, config, state, now=missing_now).quality == "MISSING"
