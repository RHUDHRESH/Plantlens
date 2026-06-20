"""Deterministic fault candidate scoring."""

from __future__ import annotations

from typing import Any


def _relation_matches(expected: str, observed: str) -> bool:
    if expected == observed:
        return True
    aliases = {
        "high": {"high", "rising"},
        "low": {"low", "falling"},
        "missing": {"missing", "stale", "stuck"},
        "noisy": {"noisy"},
        "inconsistent": {"inconsistent"},
    }
    return observed in aliases.get(expected, {expected})


def _is_downstream_of(
    asset_id: str,
    upstream_id: str,
    causal_matrix: dict[str, Any] | None,
) -> bool:
    if causal_matrix is None:
        return False
    adjacency = causal_matrix.get("adjacency") or {}
    queue = [upstream_id]
    visited: set[str] = set()
    while queue:
        node = queue.pop(0)
        if node == asset_id:
            return True
        if node in visited:
            continue
        visited.add(node)
        queue.extend(adjacency.get(node, []))
    return False


def _power_sag_context_adjustment(
    fault_signature: dict[str, Any],
    observed_signals: dict[str, Any],
    causal_matrix: dict[str, Any] | None,
) -> float:
    """Adjust score when upstream supply voltage sag explains downstream symptoms."""
    adjustment = 0.0
    sag_sources: list[str] = []
    for key, obs in observed_signals.items():
        if key.endswith(".supply_voltage") and obs.get("relation") == "low":
            sag_sources.append(key.split(".", 1)[0])

    if not sag_sources:
        return 0.0

    fault_asset = fault_signature["asset_id"]
    fault_mode_id = fault_signature.get("fault_mode_id", "")

    for source_asset in sag_sources:
        if fault_asset == source_asset and "voltage" in fault_mode_id:
            adjustment += 0.18
        elif _is_downstream_of(fault_asset, source_asset, causal_matrix):
            if fault_mode_id in {"mechanical_obstruction", "bearing_friction"}:
                adjustment -= 0.22
            elif "voltage" not in fault_mode_id and "stall" not in fault_mode_id:
                adjustment -= 0.08
    return adjustment


def _airflow_context_adjustment(
    fault_signature: dict[str, Any],
    observed_signals: dict[str, Any],
) -> float:
    """Prefer blower/airflow faults when motor electrical signals are nominal."""
    fault_mode_id = fault_signature.get("fault_mode_id", "")
    if "blockage" not in fault_mode_id and "airflow" not in fault_mode_id:
        return 0.0

    motor_currents = [v for k, v in observed_signals.items() if k.endswith(".motor_current")]
    motor_rpms = [v for k, v in observed_signals.items() if k.endswith(".motor_rpm")]
    if motor_currents and motor_rpms:
        if all(c.get("relation") not in {"high"} for c in motor_currents) and all(
            r.get("relation") not in {"low"} for r in motor_rpms
        ):
            return 0.15
    return 0.0


def _quality_penalty(data_quality: dict[str, Any], signal_key: str) -> float:
    entry = data_quality.get(signal_key) or {}
    status = entry.get("timestamp_status") or entry.get("status") or "fresh"
    quality = (entry.get("quality") or "good").lower()
    penalty = 0.0
    if status in {"stale", "missing"}:
        penalty += 0.15
    if quality in {"bad", "poor", "uncertain"}:
        penalty += 0.10
    return penalty


def score_fault_candidate(
    fault_signature: dict[str, Any],
    observed_signals: dict[str, Any],
    data_quality: dict[str, Any],
    observability_result: dict[str, Any],
    causal_context: dict[str, Any] | None = None,
    causal_matrix: dict[str, Any] | None = None,
) -> dict[str, Any]:
    signature = fault_signature.get("signature") or []
    matched_required: list[str] = []
    missing_required: list[str] = []
    matched_optional: list[str] = []
    conflicting: list[str] = []
    penalty = 0.0

    required_weight = 0.0
    matched_required_weight = 0.0
    optional_weight = 0.0
    matched_optional_weight = 0.0

    for entry in signature:
        key = entry["signal_key"]
        expected_relation = entry.get("relation", "inconsistent")
        weight = float(entry.get("weight", 0.5))
        is_required = bool(entry.get("required", False))
        observed = observed_signals.get(key)

        if is_required:
            required_weight += weight
        else:
            optional_weight += weight

        if observed is None:
            if is_required:
                missing_required.append(key)
            penalty += _quality_penalty(data_quality, key) or 0.08
            continue

        observed_relation = observed.get("relation", "inconsistent")
        penalty += _quality_penalty(data_quality, key)

        if _relation_matches(expected_relation, observed_relation):
            if is_required:
                matched_required.append(key)
                matched_required_weight += weight
            else:
                matched_optional.append(key)
                matched_optional_weight += weight
        else:
            conflicting.append(key)
            penalty += 0.12

    required_rules = fault_signature.get("required_evidence") or []
    required_count = len(required_rules)
    matched_required_count = len(matched_required)

    raw_score = 0.0
    if required_weight > 0:
        raw_score += 0.7 * (matched_required_weight / required_weight)
    if optional_weight > 0:
        raw_score += 0.3 * (matched_optional_weight / optional_weight)
    if required_count > 0 and matched_required_count == required_count:
        raw_score += 0.08 * min(required_count, 3)
    raw_score = max(0.0, min(1.0, raw_score - penalty))

    if missing_required:
        raw_score *= max(0.35, 1.0 - (len(missing_required) * 0.2))

    confidence_ceiling = float(observability_result.get("confidence_ceiling", 0.1))
    final_score = min(raw_score, confidence_ceiling)

    context_adjustment = _power_sag_context_adjustment(fault_signature, observed_signals, causal_matrix)
    context_adjustment += _airflow_context_adjustment(fault_signature, observed_signals)

    if causal_context:
        upstream_boost = float(causal_context.get("upstream_support", 0.0))
        upstream_preference = float(causal_context.get("upstream_preference", 0.0))
        match_ratio = (matched_required_count / required_count) if required_count else 0.0
        context_adjustment += (upstream_boost * 0.05) + (upstream_preference * match_ratio * 0.12)

    final_score = max(0.0, min(confidence_ceiling, final_score + context_adjustment))

    explanation_parts: list[str] = []
    if matched_required:
        explanation_parts.append(
            f"Matched required evidence: {', '.join(matched_required)}."
        )
    if missing_required:
        explanation_parts.append(
            f"Missing required evidence: {', '.join(missing_required)}."
        )
    if conflicting:
        explanation_parts.append(f"Conflicting evidence: {', '.join(conflicting)}.")
    if penalty > 0:
        explanation_parts.append(f"Data quality penalty: {penalty:.2f}.")
    if final_score < raw_score:
        explanation_parts.append(
            f"Confidence capped at {confidence_ceiling:.2f} by observability ceiling."
        )
    if not explanation_parts:
        explanation_parts.append("Insufficient evidence for this fault mode.")

    return {
        "fault_key": fault_signature.get("fault_key", ""),
        "raw_score": round(raw_score, 4),
        "confidence_ceiling": round(confidence_ceiling, 2),
        "final_score": round(final_score, 4),
        "matched_required_count": matched_required_count,
        "required_evidence_count": required_count,
        "matched_required_evidence": matched_required,
        "missing_required_evidence": missing_required,
        "matched_optional_evidence": matched_optional,
        "conflicting_evidence": conflicting,
        "data_quality_penalty": round(penalty, 4),
        "explanation": " ".join(explanation_parts),
    }


def rank_fault_candidates(
    fault_signatures: list[dict[str, Any]],
    observability_rows: list[dict[str, Any]],
    observed_signals: dict[str, Any],
    data_quality: dict[str, Any],
    causal_matrix: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    obs_by_key = {row["fault_key"]: row for row in observability_rows}
    ranked: list[dict[str, Any]] = []

    reverse_adj = (causal_matrix or {}).get("reverse_adjacency") or {}
    topo = (causal_matrix or {}).get("topological_order") or []
    depth_index = {asset_id: index for index, asset_id in enumerate(topo)}
    topo_len = max(len(topo), 1)

    for fault in fault_signatures:
        fault_key = fault["fault_key"]
        asset_id = fault["asset_id"]
        causal_context: dict[str, Any] = {}
        upstream_assets = reverse_adj.get(asset_id) or []
        if upstream_assets:
            causal_context["upstream_support"] = min(1.0, len(upstream_assets) * 0.2)
        depth = depth_index.get(asset_id, topo_len - 1)
        causal_context["upstream_preference"] = max(0.0, 1.0 - (depth / topo_len))

        scored = score_fault_candidate(
            fault,
            observed_signals,
            data_quality,
            obs_by_key.get(fault_key, {"confidence_ceiling": 0.1}),
            causal_context=causal_context or None,
            causal_matrix=causal_matrix,
        )
        ranked.append(scored)

    severity_rank = {"critical": 4, "high": 3, "warning": 2, "info": 1}
    fault_severity = {f["fault_key"]: severity_rank.get(f.get("severity", "warning"), 2) for f in fault_signatures}

    ranked.sort(
        key=lambda r: (
            -r["final_score"],
            -r.get("matched_required_count", 0),
            -fault_severity.get(r["fault_key"], 2),
            r["fault_key"],
        ),
    )
    return ranked