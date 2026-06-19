"""Tag quality / staleness classification tests."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.runtime.quality import classify_tag, is_process_evidence_usable

TS = datetime(2026, 6, 18, 12, 0, 0, tzinfo=timezone.utc)


def test_good_fresh_value():
    result = classify_tag(
        value=3.4,
        raw_quality="GOOD",
        timestamp=TS,
        now=TS + timedelta(milliseconds=200),
    )
    assert result.quality == "GOOD"


def test_stale_value():
    result = classify_tag(
        value=3.4,
        raw_quality="GOOD",
        timestamp=TS,
        now=TS + timedelta(seconds=3),
        stale_after_ms=1500,
    )
    assert result.quality == "STALE"


def test_missing_value():
    result = classify_tag(
        value=None,
        raw_quality="MISSING",
        timestamp=TS,
        now=TS,
    )
    assert result.quality == "MISSING"


def test_bad_quality_from_gateway():
    result = classify_tag(
        value=3.4,
        raw_quality="BAD",
        timestamp=TS,
        now=TS,
    )
    assert result.quality == "BAD"


def test_out_of_range_value():
    result = classify_tag(
        value=120.0,
        raw_quality="GOOD",
        timestamp=TS,
        now=TS,
        max_value=100.0,
    )
    assert result.quality == "OUT_OF_RANGE"


def test_stale_not_usable_for_process_evidence():
    assert not is_process_evidence_usable("STALE")
    assert is_process_evidence_usable("GOOD")