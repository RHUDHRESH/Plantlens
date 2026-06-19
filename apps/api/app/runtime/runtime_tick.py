"""Single deterministic runtime evaluation tick."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.runtime.alarm_engine import evaluate_alarms
from app.runtime.asset_status import derive_asset_status
from app.runtime.quality import (
    DEFAULT_MISSING_AFTER_MS,
    DEFAULT_STALE_AFTER_MS,
    QualityClass,
    classify_tag,
)
from app.runtime.calm_card_engine import (
    build_calm_card,
    build_calm_card_from_evidence,
    find_blocked_actions,
    select_recommended_action,
)
from app.runtime.config_loader import RuntimeConfig
from app.runtime.evidence import build_runtime_evidence_packet, packet_to_dict
from app.runtime.projection import update_projection
from app.runtime.runtime_state import RuntimeState
from app.runtime.situation_engine import evaluate_situations
from app.schemas.common import TagQuality
from app.schemas.tag_frame import TagFrame


def _to_tag_quality(quality: QualityClass) -> TagQuality:
    if quality == "SUSPECT":
        return "UNCERTAIN"
    if quality == "OUT_OF_RANGE":
        return "BAD"
    return quality  # type: ignore[return-value]


def normalize_tag_quality(
    frame: TagFrame,
    config: RuntimeConfig,
    state: RuntimeState,
    *,
    now: datetime,
) -> TagFrame:
    """Apply deterministic quality/staleness classification to an incoming frame."""
    policy = config.tag_index.get(frame.tag_id, {}).get("quality_policy", {})
    previous = state.get_tag(frame.tag_id)
    prev_value: float | None = None
    prev_ts: datetime | None = None
    if previous is not None and isinstance(previous.value, (int, float)):
        prev_value = float(previous.value)
        prev_ts = previous.timestamp

    # Simulator emits sparse events; age-based staleness applies to polled gateway feeds.
    received_at = frame.ingest_ts or frame.timestamp
    if frame.source == "simulator":
        received_at = now

    result = classify_tag(
        value=frame.value,
        raw_quality=frame.quality,
        timestamp=received_at,
        now=now,
        stale_after_ms=int(policy.get("stale_after_ms", DEFAULT_STALE_AFTER_MS)),
        missing_after_ms=int(policy.get("missing_after_ms", DEFAULT_MISSING_AFTER_MS)),
        min_value=policy.get("min_value"),
        max_value=policy.get("max_value"),
        max_rate_per_s=policy.get("max_rate_per_s"),
        previous_value=prev_value,
        previous_ts=prev_ts,
    )
    normalized = _to_tag_quality(result.quality)
    if normalized != frame.quality:
        return frame.model_copy(update={"quality": normalized})
    return frame


def _refresh_tag_qualities(
    state: RuntimeState,
    config: RuntimeConfig,
    *,
    now: datetime,
) -> None:
    """Re-evaluate age-based staleness for polled gateway tags on each tick."""
    for tag_id in list(state.tags):
        frame = state.get_tag(tag_id)
        if frame is None or frame.source == "simulator":
            continue
        refreshed = normalize_tag_quality(frame, config, state, now=now)
        if refreshed.quality != frame.quality:
            state.refresh_tag(refreshed)


def _situation_spec(graph_index: dict[str, Any], situation_type: str | None) -> dict[str, Any] | None:
    if not situation_type:
        return None
    for spec in graph_index.get("situation_types", []):
        if spec.get("id") == situation_type:
            return spec
    return None


def _resolve_projection(
    config: RuntimeConfig,
    state: RuntimeState,
    situation: dict[str, Any] | None,
    now: datetime,
) -> dict[str, Any] | None:
    if not situation:
        return None
    spec = _situation_spec(config.graph_index, situation.get("situation_type"))
    if not spec:
        return None
    proj_cfg = spec.get("projection") or {}
    tag_id = proj_cfg.get("tag_id")
    alarm_id = proj_cfg.get("alarm_id")
    if not tag_id:
        return None
    frame = state.get_tag(tag_id)
    if not frame or frame.quality != "GOOD" or not isinstance(frame.value, (int, float)):
        return None
    threshold = float(proj_cfg.get("threshold", 75.0))
    if alarm_id:
        rule = next((r for r in config.alarm_rules if r.id == alarm_id), None)
        if rule and rule.condition.threshold is not None:
            threshold = float(rule.condition.threshold)
    return update_projection(
        tag_id,
        float(frame.value),
        now,
        threshold=threshold,
        target_label=proj_cfg.get("label", tag_id),
        quality=frame.quality,
    )


def evaluate_runtime_tick(
    state: RuntimeState,
    config: RuntimeConfig,
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Run full pipeline: alarms → DAG → situation → evidence → calm card → asset status."""
    tick_now = now or datetime.now(timezone.utc)
    if tick_now.tzinfo is None:
        tick_now = tick_now.replace(tzinfo=timezone.utc)

    _refresh_tag_qualities(state, config, now=tick_now)

    active_alarms = evaluate_alarms(state, config.alarm_rules, tick_now)
    state.active_alarms = {alarm["alarm_id"]: alarm for alarm in active_alarms}

    situations, trace = evaluate_situations(
        state,
        active_alarms,
        config.graph_index,
        now=tick_now,
        asset_index=config.asset_index,
    )
    state.active_situations = {
        situation["situation_id"]: situation for situation in situations
    }

    situation = situations[0] if situations else None
    projection = _resolve_projection(config, state, situation, tick_now)

    evidence_packet = None
    calm_card = None

    if situation and trace:
        situation_type = situation.get("situation_type")
        spec = _situation_spec(config.graph_index, situation_type)
        blocked = find_blocked_actions(
            situation_type,
            set(situation.get("grouped_alarm_ids", [])),
            config.action_envelope,
        )
        recommended = [select_recommended_action(situation_type, config.action_envelope)]

        evidence_packet = build_runtime_evidence_packet(
            plant_id=config.plant_id,
            runtime_bundle_version=config.graph_index.get("graph_id", "unknown"),
            ts=tick_now,
            trace=trace,
            situation=situation,
            active_alarms=active_alarms,
            state_tags=state.tags,
            graph_index=config.graph_index,
            blocked_actions=blocked,
            recommended_checks=recommended,
            projection=projection,
        )
        state.latest_evidence_packet = packet_to_dict(evidence_packet)
        calm_card = build_calm_card_from_evidence(
            evidence_packet,
            config.action_envelope,
            situation_spec=spec,
            severity=situation.get("severity", "warning"),
        )
        if situation.get("root_asset_name"):
            calm_card["root_asset_name"] = situation["root_asset_name"]
        state.latest_calm_card = calm_card
    else:
        state.latest_evidence_packet = None
        state.latest_calm_card = None

    state.asset_status = derive_asset_status(
        config.asset_index,
        state.active_alarms,
        state.active_situations,
        state.tags,
        tick_now,
    )

    return {
        "active_alarms": active_alarms,
        "situations": situations,
        "trace": trace,
        "evidence_packet": evidence_packet,
        "calm_card": calm_card,
        "projection": projection,
    }


def on_tag_frame(
    state: RuntimeState,
    frame: TagFrame,
    config: RuntimeConfig,
) -> dict[str, Any]:
    now = frame.timestamp
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    normalized = normalize_tag_quality(frame, config, state, now=now)
    if normalized.ingest_ts is None and frame.source != "simulator":
        normalized = normalized.model_copy(update={"ingest_ts": now})
    state.update_tag(normalized)
    return evaluate_runtime_tick(state, config, now=now)