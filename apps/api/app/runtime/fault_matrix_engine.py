"""Deterministic fault-matrix evidence scoring (overlay; DAG remains root-cause authority).

Confidence(F) = clamp( Σ wᵢ·matchᵢ·κᵢ / Σ wᵢ , 0, 1 )

matchᵢ: +1 exact | +0.5 partial/trending | 0 missing | −1 contradiction
κᵢ:     GOOD=1 | SUSPECT/UNCERTAIN=0.5 | else 0

Contradiction veto: required symptom contradicts at GOOD quality → confidence = 0
Coverage: fraction of symptoms with usable data (GOOD or SUSPECT/UNCERTAIN)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from app.schemas.fault_matrix import FaultDef, FaultMatrix, FaultMatrixScore

Band = str  # normal | warning_high | warning_low | critical_high | critical_low | unknown

_TREND_STRONG = 0.01
_TREND_WEAK = 0.001


@dataclass(frozen=True)
class TagObservation:
    """Per-tag evidence view for matrix scoring."""

    quality: str = "MISSING"
    band: Band = "unknown"
    trend: float = 0.0
    value: Any = None


def _kappa(quality: str) -> float:
    q = (quality or "").upper()
    if q == "GOOD":
        return 1.0
    if q in {"SUSPECT", "UNCERTAIN"}:
        return 0.5
    return 0.0


def _is_usable(quality: str) -> bool:
    return _kappa(quality) > 0.0


def _match_direction(expected: str, obs: TagObservation) -> float:
    """Map (expected_direction, band, trend, value) → match score."""
    expected = expected.upper()
    band = obs.band or "unknown"
    trend = float(obs.trend or 0.0)

    if expected in {"TRUE", "FALSE"}:
        if obs.value is None or not _is_usable(obs.quality):
            return 0.0
        truthy = obs.value is True or obs.value == 1 or obs.value == "true"
        falsy = obs.value is False or obs.value == 0 or obs.value == "false"
        if expected == "TRUE":
            if truthy:
                return 1.0
            if falsy:
                return -1.0
            return 0.0
        if truthy:
            return -1.0
        if falsy:
            return 1.0
        return 0.0

    if band == "unknown" and expected in {"HIGH", "LOW"}:
        return 0.0

    if expected == "HIGH":
        if band in {"warning_high", "critical_high"}:
            return 1.0
        if band == "normal" and trend > _TREND_STRONG:
            return 0.5
        if band in {"warning_low", "critical_low"}:
            return -1.0
        return 0.0

    if expected == "LOW":
        if band in {"warning_low", "critical_low"}:
            return 1.0
        if band == "normal" and trend < -_TREND_STRONG:
            return 0.5
        if band in {"warning_high", "critical_high"}:
            return -1.0
        return 0.0

    if expected == "RISING":
        if trend > _TREND_STRONG:
            return 1.0
        if trend > _TREND_WEAK:
            return 0.5
        if trend < -_TREND_STRONG:
            return -1.0
        return 0.0

    if expected == "FALLING":
        if trend < -_TREND_STRONG:
            return 1.0
        if trend < -_TREND_WEAK:
            return 0.5
        if trend > _TREND_STRONG:
            return -1.0
        return 0.0

    return 0.0


def _normalize_matrix(matrix: FaultMatrix | Mapping[str, Any]) -> FaultMatrix:
    if isinstance(matrix, FaultMatrix):
        return matrix
    return FaultMatrix.model_validate(matrix)


def score_fault(
    fault: FaultDef,
    observations: Mapping[str, TagObservation],
) -> FaultMatrixScore:
    """Score a single authored fault against current tag observations."""
    numerator = 0.0
    weight_sum = 0.0
    usable_count = 0
    contradicted = False
    supporting: list[str] = []
    contradicting: list[str] = []
    missing: list[str] = []

    for sym in fault.symptoms:
        w = float(sym.weight)
        weight_sum += w
        obs = observations.get(sym.tag_id)
        if obs is None or not _is_usable(obs.quality):
            missing.append(f"{sym.tag_id} (no usable data)")
            continue

        kappa = _kappa(obs.quality)
        match = _match_direction(sym.expected_direction, obs)
        usable_count += 1
        numerator += w * match * kappa

        label = (
            f"{sym.tag_id} {sym.expected_direction} "
            f"(band={obs.band}, trend={obs.trend:+.3f}, q={obs.quality})"
        )
        if match > 0:
            supporting.append(label)
        elif match < 0:
            contradicting.append(label)
            if sym.required and match == -1.0 and kappa == 1.0:
                contradicted = True
        else:
            missing.append(f"{sym.tag_id} (ambiguous)")

    symptom_count = len(fault.symptoms)
    raw = numerator / weight_sum if weight_sum > 0 else 0.0
    confidence = 0.0 if contradicted else max(0.0, min(1.0, raw))
    coverage = usable_count / symptom_count if symptom_count > 0 else 0.0

    return FaultMatrixScore(
        fault_id=fault.id,
        fault_name=fault.name,
        asset_id=fault.asset_id,
        confidence=confidence,
        coverage=coverage,
        contradicted=contradicted,
        situation_type=fault.situation_type,
        safe_action_id=fault.safe_action_id,
        supporting_symptoms=supporting,
        contradicting_symptoms=contradicting,
        missing_symptoms=missing,
    )


def score_fault_matrix(
    matrix: FaultMatrix | Mapping[str, Any],
    observations: Mapping[str, TagObservation],
) -> list[FaultMatrixScore]:
    """Score all faults; return candidates sorted by confidence descending."""
    doc = _normalize_matrix(matrix)
    scored = [score_fault(fault, observations) for fault in doc.faults]
    return sorted(scored, key=lambda s: (-s.confidence, s.fault_id))


def _band_from_alarm(severity: str, op: str | None) -> Band:
    sev = (severity or "warning").lower()
    prefix = "critical" if sev == "critical" else "warning"
    if op in {">", ">=", "bool_true"}:
        return f"{prefix}_high"
    if op in {"<", "<=", "bool_false"}:
        return f"{prefix}_low"
    return "unknown"


def _band_from_thresholds(
    tag_id: str,
    value: float,
    alarm_rules: list[Any] | None,
) -> Band:
    """Derive HIGH/LOW band from authored thresholds even before an alarm latches."""
    if not alarm_rules:
        return "normal"
    best: Band = "normal"
    for rule in alarm_rules:
        alarm_class = getattr(rule, "alarm_class", None)
        if alarm_class is None and isinstance(rule, dict):
            alarm_class = rule.get("alarm_class", "process")
        if alarm_class == "data_quality":
            continue
        rule_tag = getattr(rule, "tag", None)
        if rule_tag is None and isinstance(rule, dict):
            rule_tag = rule.get("tag")
        if rule_tag != tag_id:
            continue
        cond = getattr(rule, "condition", None)
        if cond is None and isinstance(rule, dict):
            cond = rule.get("condition")
        op = getattr(cond, "op", None) if cond is not None else None
        if op is None and isinstance(cond, dict):
            op = cond.get("op")
        threshold = getattr(cond, "threshold", None) if cond is not None else None
        if threshold is None and isinstance(cond, dict):
            threshold = cond.get("threshold")
        critical = getattr(cond, "critical", None) if cond is not None else None
        if critical is None and isinstance(cond, dict):
            critical = cond.get("critical")
        warning = getattr(cond, "warning", None) if cond is not None else None
        if warning is None and isinstance(cond, dict):
            warning = cond.get("warning")
        severity = getattr(rule, "severity", "warning")
        if severity is None and isinstance(rule, dict):
            severity = rule.get("severity", "warning")
        if op in {">", ">="} and threshold is not None and value >= float(threshold):
            return _band_from_alarm(str(severity), str(op))
        if op in {"<", "<="} and threshold is not None and value <= float(threshold):
            return _band_from_alarm(str(severity), str(op))
        if critical is not None and value <= float(critical):
            return "critical_low"
        if warning is not None and value <= float(warning):
            return "warning_low"
        if critical is not None and value >= float(critical):
            return "critical_high"
        if warning is not None and value >= float(warning):
            return "warning_high"
    return best


def observations_from_tags(
    tags: Mapping[str, Any],
    *,
    trends: Mapping[str, float] | None = None,
    active_alarms: list[dict[str, Any]] | None = None,
    alarm_rules: list[Any] | None = None,
) -> dict[str, TagObservation]:
    """Build TagObservation map from live TagFrames + optional trends/alarms.

    Band is derived from active alarms (and their rule ops) when present;
    otherwise numeric tags default to ``normal`` when quality is usable.
    """
    trends = trends or {}
    alarm_by_tag: dict[str, dict[str, Any]] = {}
    for alarm in active_alarms or []:
        if alarm.get("alarm_class") == "data_quality":
            continue
        tag_id = alarm.get("tag_id")
        if tag_id and tag_id not in alarm_by_tag:
            alarm_by_tag[tag_id] = alarm

    op_by_alarm: dict[str, str] = {}
    if alarm_rules:
        for rule in alarm_rules:
            rid = getattr(rule, "id", None) or (rule.get("id") if isinstance(rule, dict) else None)
            alarm_class = getattr(rule, "alarm_class", None)
            if alarm_class is None and isinstance(rule, dict):
                alarm_class = rule.get("alarm_class", "process")
            if alarm_class == "data_quality":
                continue
            cond = getattr(rule, "condition", None)
            if cond is None and isinstance(rule, dict):
                cond = rule.get("condition")
            op = getattr(cond, "op", None) if cond is not None else None
            if op is None and isinstance(cond, dict):
                op = cond.get("op")
            if rid and op and not str(op).startswith("quality_"):
                op_by_alarm[str(rid)] = str(op)

    out: dict[str, TagObservation] = {}
    for tag_id, frame in tags.items():
        quality = getattr(frame, "quality", None)
        if quality is None and isinstance(frame, dict):
            quality = frame.get("quality", "MISSING")
        value = getattr(frame, "value", None)
        if value is None and isinstance(frame, dict):
            value = frame.get("value")

        alarm = alarm_by_tag.get(tag_id)
        if alarm:
            op = op_by_alarm.get(alarm.get("alarm_id", ""), None)
            band = _band_from_alarm(str(alarm.get("severity", "warning")), op)
        elif _is_usable(str(quality)) and isinstance(value, (int, float)):
            band = _band_from_thresholds(tag_id, float(value), alarm_rules)
        elif _is_usable(str(quality)) and value is not None:
            band = "normal"
        else:
            band = "unknown"

        # Boolean tags: expose value for TRUE/FALSE symptoms; band still set if alarmed.
        out[tag_id] = TagObservation(
            quality=str(quality or "MISSING"),
            band=band,
            trend=float(trends.get(tag_id, 0.0)),
            value=value,
        )
    return out
