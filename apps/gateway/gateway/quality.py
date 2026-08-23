"""Gateway-side quality normalizer — mirrors apps/api/app/runtime/quality.py.

Keep constants and classify rules in sync with the API shared normalizer so
simulator + gateway emitters produce identical STALE/MISSING under the same
quality_policy. Gateway never diagnoses; it only quality-stamps TagFrames.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal

QualityClass = Literal["GOOD", "SUSPECT", "STALE", "MISSING", "BAD", "OUT_OF_RANGE"]

DEFAULT_STALE_AFTER_MS = 1500
DEFAULT_MISSING_AFTER_MS = 5000


@dataclass(frozen=True, slots=True)
class QualityResult:
    quality: QualityClass
    reason: str


def classify_tag(
    *,
    value: Any,
    raw_quality: str,
    timestamp: datetime,
    now: datetime,
    stale_after_ms: int = DEFAULT_STALE_AFTER_MS,
    missing_after_ms: int = DEFAULT_MISSING_AFTER_MS,
    min_value: float | None = None,
    max_value: float | None = None,
    max_rate_per_s: float | None = None,
    previous_value: float | None = None,
    previous_ts: datetime | None = None,
) -> QualityResult:
    """Classify a tag reading — fail closed on bad/stale/missing data."""
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)

    if raw_quality == "BAD":
        return QualityResult("BAD", "Gateway reported BAD quality")

    if raw_quality == "STALE":
        return QualityResult("STALE", "Gateway reported STALE quality")

    if raw_quality == "MISSING" or value is None:
        return QualityResult("MISSING", "No value received from source")

    age_ms = (now - timestamp).total_seconds() * 1000
    if age_ms > missing_after_ms:
        return QualityResult(
            "MISSING",
            f"No update for {int(age_ms)}ms (missing_after_ms={missing_after_ms})",
        )

    if age_ms > stale_after_ms:
        return QualityResult(
            "STALE",
            f"Last update {int(age_ms)}ms ago (stale_after_ms={stale_after_ms})",
        )

    if raw_quality == "UNCERTAIN":
        return QualityResult("SUSPECT", "Source quality UNCERTAIN — treat as suspect")

    if isinstance(value, (int, float)):
        numeric = float(value)
        if min_value is not None and numeric < min_value:
            return QualityResult(
                "OUT_OF_RANGE",
                f"Value {numeric} below physical min {min_value}",
            )
        if max_value is not None and numeric > max_value:
            return QualityResult(
                "OUT_OF_RANGE",
                f"Value {numeric} above physical max {max_value}",
            )
        if (
            max_rate_per_s is not None
            and previous_value is not None
            and previous_ts is not None
        ):
            dt = (timestamp - previous_ts).total_seconds()
            if dt > 0:
                rate = abs(numeric - previous_value) / dt
                if rate > max_rate_per_s:
                    return QualityResult(
                        "SUSPECT",
                        f"Rate of change {rate:.2f}/s exceeds limit {max_rate_per_s}/s",
                    )

    return QualityResult("GOOD", "Fresh value within expected bounds")


def normalize_quality_reading(
    *,
    value: Any,
    raw_quality: str,
    timestamp: datetime,
    now: datetime,
    quality_policy: dict[str, Any] | None = None,
    previous_value: float | None = None,
    previous_ts: datetime | None = None,
) -> QualityResult:
    """Shared quality normalizer entrypoint — same contract as API runtime.quality."""
    policy = quality_policy or {}
    return classify_tag(
        value=value,
        raw_quality=raw_quality,
        timestamp=timestamp,
        now=now,
        stale_after_ms=int(policy.get("stale_after_ms", DEFAULT_STALE_AFTER_MS)),
        missing_after_ms=int(policy.get("missing_after_ms", DEFAULT_MISSING_AFTER_MS)),
        min_value=policy.get("min_value"),
        max_value=policy.get("max_value"),
        max_rate_per_s=policy.get("max_rate_per_s"),
        previous_value=previous_value,
        previous_ts=previous_ts,
    )


def quality_for_poll_age(
    *,
    last_success: datetime | None,
    now: datetime,
    stale_after_ms: int,
    missing_after_ms: int = DEFAULT_MISSING_AFTER_MS,
) -> str:
    """Map poll dropout age to STALE/MISSING using the shared classifier."""
    if last_success is None:
        return "MISSING"
    result = normalize_quality_reading(
        value=0.0,  # value present — age drives STALE/MISSING
        raw_quality="GOOD",
        timestamp=last_success,
        now=now,
        quality_policy={
            "stale_after_ms": stale_after_ms,
            "missing_after_ms": missing_after_ms,
        },
    )
    return result.quality if result.quality in {"STALE", "MISSING", "GOOD"} else "STALE"
