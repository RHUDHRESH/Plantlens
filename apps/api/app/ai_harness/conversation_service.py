"""AI conversation service — evidence-grounded answers with optional LLM narration.

Flow per message:
1. classify_intent
2. build_context
3. check role policy
4. if LLM enabled+healthy: pack context → LLM → parse → evidence_guard
5. else (or on LLM failure): run deterministic builder
6. ALWAYS run evidence_guard before return

Answers cite RuntimeEvidencePacket / CalmCard / compiled bundle.
AI never diagnoses live faults — it only drafts/explains from evidence.
"""

from __future__ import annotations

import json
import re
import uuid
from datetime import UTC, datetime
from typing import Any

from app.ai_harness.context_builder import AIContext, build_context
from app.ai_harness.evidence_guard import GuardViolation, check_no_evidence, guard_ai_response
from app.ai_harness.intents import Intent, classify_intent
from app.ai_harness.llm_client import LlmClientError, achat_completions, acheck_llm_health
from app.ai_harness.response_schema import AIResponse, EvidenceRef
from app.ai_harness.role_policy import get_refusal_message, is_intent_allowed
from app.services.observability import record_llm_fallback
from app.settings import Settings, get_settings


_LLM_SYSTEM = """You are PlantLens Fable harness — a read-only industrial advisor.

STRICT RULES:
1. Explain or draft ONLY from the packed RuntimeEvidencePacket / calm card JSON.
2. NEVER invent tag values, root causes, assets, or alarms not present in the context.
3. NEVER diagnose live faults independently — the deterministic DAG already selected the root.
4. NEVER propose hardware writes, PLC commands, coil toggles, or breaker trips.
5. Respond with a single JSON object matching this schema:
{
  "summary": "short headline",
  "answer": "operator-facing explanation citing evidence ids",
  "cited_assets": ["..."],
  "cited_alarms": ["..."],
  "cited_edges": ["..."],
  "limitations": ["..."],
  "confidence": 0.0,
  "requires_human_approval": false,
  "draft_artifact": null
}
6. If evidence is insufficient, say so in answer and set confidence to 0.
"""


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


async def answer_message(
    message: str,
    *,
    role: str,
    snapshot: dict[str, Any],
    compiled_bundle: dict[str, Any] | None = None,
    settings: Settings | None = None,
) -> AIResponse:
    """Build an evidence-grounded AIResponse (async — LLM I/O never blocks the loop).

    Prefer deterministic builders. Optionally enrich via LLM when enabled and healthy.
    LLM answers that fail evidence_guard are demoted to the deterministic fallback.
    Always runs evidence_guard. Never writes hardware.
    """
    intent = classify_intent(message)
    ctx = build_context(role=role, snapshot=snapshot, compiled_bundle=compiled_bundle)
    cfg = settings or get_settings()

    # Hard safety gate
    if intent == Intent.UNKNOWN_UNSAFE:
        return _refusal_response(
            intent=intent,
            role=role,
            reason=(
                "PlantLens does not issue hardware commands, write to PLCs, "
                "or control equipment. This is a decision-support system."
            ),
        )

    # Role gate
    if not is_intent_allowed(role, intent):
        return _refusal_response(
            intent=intent,
            role=role,
            reason=get_refusal_message(role, intent),
        )

    # Deterministic baseline (always available as fallback)
    try:
        deterministic = _build_answer(message, intent, ctx)
    except GuardViolation as exc:
        return _refusal_response(intent=intent, role=role, reason=str(exc))

    response = deterministic
    used_llm = False

    if await _should_try_llm(cfg, intent):
        try:
            llm_response = await _try_llm_answer(message, intent, ctx, cfg)
            if llm_response is not None:
                # Guard demotion: LLM must pass evidence_guard or we keep deterministic.
                try:
                    guarded_llm = guard_ai_response(llm_response, ctx)
                    response = guarded_llm
                    used_llm = True
                except GuardViolation:
                    record_llm_fallback()
                    response = deterministic
                    used_llm = False
        except (LlmClientError, json.JSONDecodeError, ValueError, KeyError, TypeError):
            record_llm_fallback()
            response = deterministic
            used_llm = False

    try:
        response = guard_ai_response(response, ctx)
    except GuardViolation as exc:
        return _refusal_response(intent=intent, role=role, reason=str(exc))

    if used_llm and "llm_narration" not in response.limitations:
        response.limitations.append(
            "llm_narration: assisted by local LLM from packed evidence; "
            "root cause remains deterministic."
        )

    return response


async def _should_try_llm(cfg: Settings, intent: Intent) -> bool:
    if intent == Intent.UNKNOWN_UNSAFE:
        return False
    if not cfg.plantlens_llm_enabled:
        return False
    health = await acheck_llm_health(cfg)
    return health.healthy


def _pack_evidence_context(ctx: AIContext) -> dict[str, Any]:
    """Compact evidence pack for the LLM — no unlimited raw state."""
    return {
        "plant_id": ctx.plant_id,
        "role": ctx.role,
        "active_situation": ctx.active_situation,
        "evidence_packet": ctx.latest_evidence_packet,
        "calm_card": ctx.calm_card,
        "active_alarm_count": len(ctx.active_alarms),
        "rejected_candidates": ctx.rejected_candidates[:8],
        "causal_path": ctx.causal_path[:12],
        "stale_or_bad_tags": ctx.stale_or_bad_tags[:12],
        "graph_edge_count": len(ctx.graph_edges),
    }


async def _try_llm_answer(
    message: str,
    intent: Intent,
    ctx: AIContext,
    cfg: Settings,
) -> AIResponse | None:
    """Tool-loop stub: pack context → LLM → validate JSON → return AIResponse.

    Caller must still run evidence_guard. Returns None to force deterministic path.
    """
    packed = _pack_evidence_context(ctx)
    user_content = (
        f"intent={intent}\n"
        f"question={message}\n"
        f"evidence_context={json.dumps(packed, default=str)}\n"
        "Respond with JSON only."
    )
    result = await achat_completions(
        [
            {"role": "system", "content": _LLM_SYSTEM},
            {"role": "user", "content": user_content},
        ],
        settings=cfg,
        temperature=0.15,
        max_tokens=700,
    )
    parsed = _parse_llm_json(result.content)
    if parsed is None:
        return None

    draft = parsed.get("draft_artifact")
    requires_approval = bool(parsed.get("requires_human_approval")) or draft is not None
    if draft is not None and isinstance(draft, dict):
        draft = {
            **draft,
            "requires_human_approval": True,
            "validation_status": draft.get("validation_status", "pending"),
        }
        requires_approval = True

    ep = ctx.latest_evidence_packet or {}
    evidence_refs = [
        EvidenceRef(
            ref_type="evidence_packet",
            ref_id=ep.get("evidence_id", "packed"),
            quote_or_value="llm_narration_from_evidence",
            timestamp=ep.get("ts"),
        )
    ]

    return _make_response(
        intent=intent,
        role=ctx.role,
        summary=str(parsed.get("summary") or "Evidence-grounded explanation."),
        answer=str(parsed.get("answer") or ""),
        evidence_refs=evidence_refs,
        cited_assets=[str(a) for a in (parsed.get("cited_assets") or [])],
        cited_alarms=[str(a) for a in (parsed.get("cited_alarms") or [])],
        cited_edges=[str(e) for e in (parsed.get("cited_edges") or [])],
        limitations=[str(x) for x in (parsed.get("limitations") or [])],
        confidence=float(parsed.get("confidence") or 0.0),
        requires_human_approval=requires_approval,
        draft_artifact=draft if isinstance(draft, dict) else None,
    )


def _parse_llm_json(content: str) -> dict[str, Any] | None:
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError:
            return None
    if not isinstance(data, dict) or not data.get("answer"):
        return None
    return data


# ---------------------------------------------------------------------------
# Router: intent → builder
# ---------------------------------------------------------------------------


def _build_answer(message: str, intent: Intent, ctx: AIContext) -> AIResponse:
    builders = {
        Intent.EXPLAIN_ROOT_CAUSE: _explain_root_cause,
        Intent.EXPLAIN_REJECTED_CANDIDATE: _explain_rejected_candidate,
        Intent.EXPLAIN_ALARM_FLOOD: _explain_alarm_flood,
        Intent.RECOMMEND_FIRST_CHECK: _recommend_first_check,
        Intent.EXPLAIN_TIME_TO_CONSEQUENCE: _explain_time_to_consequence,
        Intent.EXPLAIN_SITUATION: _explain_situation,
        Intent.DRAFT_GRAPH_CHANGE: _draft_graph_change,
        Intent.DRAFT_SIGNAL_TEMPLATE: _draft_signal_template,
        Intent.DRAFT_SCENARIO: _draft_scenario,
        Intent.DRAFT_ACTION_ENVELOPE: _draft_action_envelope,
        Intent.COMPARE_MODEL_DIFF: _compare_model_diff,
    }
    builder = builders.get(intent, _explain_situation)
    return builder(message, ctx)


# ---------------------------------------------------------------------------
# Deterministic builders
# ---------------------------------------------------------------------------


def _explain_root_cause(message: str, ctx: AIContext) -> AIResponse:
    ep = ctx.latest_evidence_packet
    if not ep or check_no_evidence(ctx):
        return _no_evidence_response(Intent.EXPLAIN_ROOT_CAUSE, ctx.role)

    chain = ep.get("evidence_chain", [])
    root_id = ep.get("root_asset_id") or "unknown"
    causal_path = ep.get("causal_path", [])
    confidence_reason = ep.get("confidence_reason", "")
    trace_id = ep.get("deterministic_trace_id", "")
    confidence = float(ep.get("confidence", 0.0))

    first = next((c for c in chain if c.get("role") == "first_signal"), None)
    supporting = [c for c in chain if c.get("role") == "supporting_signal"]
    downstream = [c for c in chain if c.get("role") == "downstream_effect"]

    parts: list[str] = []

    if first:
        ts = first.get("first_seen_ts", "")
        parts.append(
            f"First signal: {first['alarm_id']} on {first['asset_id']} at {ts}."
        )

    for s in supporting:
        parts.append(
            f"Supporting: {s['alarm_id']} on {s['asset_id']} at {s.get('first_seen_ts', '')}."
        )

    for d in downstream:
        parts.append(
            f"Downstream effect: {d['alarm_id']} on {d['asset_id']} appeared after "
            f"({d.get('first_seen_ts', '')}) — not the root."
        )

    if causal_path:
        path_str = " → ".join(
            f"{e['from_asset_id']}→{e['to_asset_id']}" for e in causal_path
        )
        parts.append(f"Approved causal path matched: {path_str}.")

    if confidence_reason:
        parts.append(f"Selection reason: {confidence_reason}")

    parts.append(
        f"Root cause selected: {root_id} (confidence {confidence:.0%}). "
        f"Deterministic trace: {trace_id}."
    )
    parts.append(
        "This determination was made by the approved causal graph only. "
        "PlantLens did not infer this from AI."
    )

    evidence_refs = [
        EvidenceRef(
            ref_type="evidence_packet",
            ref_id=ep.get("evidence_id", ""),
            quote_or_value=confidence_reason,
            timestamp=ep.get("ts", ""),
        )
    ]
    for edge in causal_path:
        evidence_refs.append(
            EvidenceRef(
                ref_type="edge",
                ref_id=edge.get("edge_id", ""),
                quote_or_value=edge.get("relation_type", ""),
            )
        )

    return _make_response(
        intent=Intent.EXPLAIN_ROOT_CAUSE,
        role=ctx.role,
        summary=f"Root cause is {root_id} based on alarm ordering and approved DAG.",
        answer=" ".join(parts),
        evidence_refs=evidence_refs,
        cited_assets=[root_id] + [d["asset_id"] for d in downstream],
        cited_alarms=[first["alarm_id"]] if first else [],
        cited_edges=[e.get("edge_id", "") for e in causal_path],
        confidence=confidence,
    )


def _explain_rejected_candidate(message: str, ctx: AIContext) -> AIResponse:
    ep = ctx.latest_evidence_packet
    if not ep:
        return _no_evidence_response(Intent.EXPLAIN_REJECTED_CANDIDATE, ctx.role)

    rejected = ep.get("rejected_candidates", [])
    if not rejected:
        return _make_response(
            intent=Intent.EXPLAIN_REJECTED_CANDIDATE,
            role=ctx.role,
            summary="No candidates were rejected.",
            answer=(
                "No alternative candidates were considered and rejected in this situation. "
                "The root cause was identified directly from the first alarm and approved causal path."
            ),
            evidence_refs=[
                EvidenceRef(
                    ref_type="evidence_packet",
                    ref_id=ep.get("evidence_id", ""),
                    quote_or_value="no rejected candidates",
                )
            ],
        )

    # Try to find asset mentioned in the question
    target: dict[str, Any] | None = None
    msg_lower = message.lower()
    for rc in rejected:
        aid = rc.get("asset_id", "")
        if aid.lower() in msg_lower:
            target = rc
            break

    candidates_to_explain = [target] if target else rejected

    parts: list[str] = []
    cited_assets: list[str] = []
    cited_alarms: list[str] = []

    for rc in candidates_to_explain:
        aid = rc.get("asset_id", "")
        cited_assets.append(aid)
        parts.append(
            f"{aid} was rejected: {rc.get('reason', 'insufficient evidence')} "
            f"(score {rc.get('score', 0):.2f})."
        )
        if rc.get("missing_evidence"):
            parts.append(f"Missing evidence for {aid}: {', '.join(rc['missing_evidence'])}.")
        if rc.get("contradicted_by"):
            parts.append(f"Contradicted by: {', '.join(rc['contradicted_by'])}.")

    ep_ref = EvidenceRef(
        ref_type="evidence_packet",
        ref_id=ep.get("evidence_id", ""),
        quote_or_value=f"{len(rejected)} rejected candidates",
    )
    refs = [ep_ref] + [
        EvidenceRef(
            ref_type="rejected_candidate",
            ref_id=rc.get("asset_id", ""),
            quote_or_value=rc.get("reason", ""),
        )
        for rc in candidates_to_explain
    ]

    return _make_response(
        intent=Intent.EXPLAIN_REJECTED_CANDIDATE,
        role=ctx.role,
        summary=f"{len(rejected)} candidate(s) rejected by the DAG.",
        answer=" ".join(parts),
        evidence_refs=refs,
        cited_assets=cited_assets,
        cited_alarms=cited_alarms,
    )


def _explain_alarm_flood(message: str, ctx: AIContext) -> AIResponse:
    ep = ctx.latest_evidence_packet
    calm = ctx.calm_card

    if not ep and not ctx.active_alarms:
        return _no_evidence_response(Intent.EXPLAIN_ALARM_FLOOD, ctx.role)

    grouped = ep.get("grouped_alarm_ids", []) if ep else []
    active = ep.get("active_alarm_ids", []) if ep else [
        a.get("alarm_id", "") for a in ctx.active_alarms
    ]
    raw_count = len(grouped) if grouped else len(active)

    parts = [f"{raw_count} alarm(s) are active in this situation."]

    if grouped:
        parts.append(
            f"PlantLens grouped these {len(grouped)} alarm(s) into one Calm Card "
            f"based on the approved causal graph: {', '.join(grouped)}."
        )
        parts.append(
            "Downstream alarms (those caused by the root fault) are shown as a group "
            "to reduce alarm fatigue. They are NOT suppressed permanently — "
            "each alarm is logged and accessible in the raw alarm list."
        )

    root_id = ep.get("root_asset_id") if ep else None
    if root_id:
        parts.append(
            f"The grouping root is {root_id}. Downstream alarms will clear automatically "
            "when the root fault is resolved."
        )

    refs = []
    if ep:
        refs.append(
            EvidenceRef(
                ref_type="evidence_packet",
                ref_id=ep.get("evidence_id", ""),
                quote_or_value=f"{raw_count} grouped alarms",
            )
        )
    refs += [EvidenceRef(ref_type="alarm", ref_id=a, quote_or_value="grouped") for a in grouped[:6]]

    return _make_response(
        intent=Intent.EXPLAIN_ALARM_FLOOD,
        role=ctx.role,
        summary=f"{raw_count} alarm(s) collapsed into one Situation.",
        answer=" ".join(parts),
        evidence_refs=refs,
        cited_alarms=grouped,
        cited_assets=[root_id] if root_id else [],
    )


def _recommend_first_check(message: str, ctx: AIContext) -> AIResponse:
    calm = ctx.calm_card
    ep = ctx.latest_evidence_packet

    if not calm and not ep:
        return _no_evidence_response(Intent.RECOMMEND_FIRST_CHECK, ctx.role)

    rec = calm.get("recommended_first_check") if calm else None
    blocked = calm.get("blocked_actions", []) if calm else []
    ttc = calm.get("time_to_consequence") if calm else None
    root_id = (calm or ep or {}).get("root_asset_id") or (ep or {}).get("root_asset_id")

    parts: list[str] = []
    proposed_actions: list[dict[str, Any]] = []

    if root_id:
        parts.append(f"Root asset: {root_id}.")

    if rec:
        label = rec.get("label", "Inspect the root asset")
        risk = rec.get("risk_level", "medium")
        iso = rec.get("requires_isolation", False)
        parts.append(f"First check: {label} (risk: {risk}, isolation required: {iso}).")
        proposed_actions.append(rec)

    if blocked:
        blocked_labels = [b.get("label", b.get("action_id", "")) for b in blocked]
        parts.append(
            f"Do NOT attempt: {', '.join(blocked_labels)} — "
            "blocked while current alarms are active."
        )

    if ttc and ttc.get("state") not in (None, "stable", "clearing"):
        mid = ttc.get("seconds_mid") or ttc.get("seconds_high")
        if mid:
            mins = int(mid // 60)
            parts.append(
                f"Advisory: estimated {mins} minute(s) to limit. "
                "This is a projection only — not a trip signal."
            )

    parts.append(
        "PlantLens does not control equipment. Follow site isolation and safety procedures."
    )

    refs = []
    if ep:
        refs.append(
            EvidenceRef(
                ref_type="evidence_packet",
                ref_id=ep.get("evidence_id", ""),
                quote_or_value="recommended action source",
            )
        )
    if rec:
        refs.append(
            EvidenceRef(
                ref_type="action",
                ref_id=rec.get("action_id", ""),
                quote_or_value=rec.get("label", ""),
            )
        )

    return _make_response(
        intent=Intent.RECOMMEND_FIRST_CHECK,
        role=ctx.role,
        summary=rec.get("label", "Inspect root asset") if rec else "No recommended action available.",
        answer=" ".join(parts),
        evidence_refs=refs,
        cited_assets=[root_id] if root_id else [],
        proposed_actions=proposed_actions,
        confidence=float((ep or {}).get("confidence", 0.5)),
    )


def _explain_time_to_consequence(message: str, ctx: AIContext) -> AIResponse:
    calm = ctx.calm_card
    ep = ctx.latest_evidence_packet

    if not calm and not ep:
        return _no_evidence_response(Intent.EXPLAIN_TIME_TO_CONSEQUENCE, ctx.role)

    ttc = (calm or {}).get("time_to_consequence") or (ep or {}).get("time_to_consequence")

    if not ttc or ttc.get("state") in ("stable", "clearing", None):
        return _make_response(
            intent=Intent.EXPLAIN_TIME_TO_CONSEQUENCE,
            role=ctx.role,
            summary="No active time-to-consequence projection.",
            answer=(
                "No active time-to-consequence trajectory is being tracked for the current situation. "
                "The monitored signal is stable or clearing."
            ),
            evidence_refs=[
                EvidenceRef(
                    ref_type="evidence_packet",
                    ref_id=(ep or {}).get("evidence_id", "no-ep"),
                    quote_or_value="no active TTC",
                )
            ],
            limitations=["Advisory projection only. Not a control signal."],
        )

    state = ttc.get("state", "approaching")
    lo = ttc.get("seconds_low")
    mid = ttc.get("seconds_mid")
    hi = ttc.get("seconds_high")
    tag_id = ttc.get("tag_id", "monitored signal")
    label = ttc.get("label", "limit")

    def _fmt(s: float | None) -> str:
        if s is None:
            return "unknown"
        return f"{int(s // 60)}m {int(s % 60)}s"

    parts = [
        f"State: {state}.",
        f"Tag: {tag_id} approaching {label}.",
        f"Estimated time to limit — low: {_fmt(lo)}, mid: {_fmt(mid)}, high: {_fmt(hi)}.",
        "Confidence decreases with longer projections.",
        "This is an advisory projection from EMA slope analysis only. "
        "PlantLens does not trip or stop equipment based on this estimate.",
    ]

    refs = []
    if ep:
        refs.append(
            EvidenceRef(
                ref_type="evidence_packet",
                ref_id=ep.get("evidence_id", ""),
                quote_or_value=f"TTC state={state}",
                timestamp=ep.get("ts", ""),
            )
        )
    if tag_id:
        refs.append(EvidenceRef(ref_type="tag", ref_id=tag_id, quote_or_value=state))

    return _make_response(
        intent=Intent.EXPLAIN_TIME_TO_CONSEQUENCE,
        role=ctx.role,
        summary=f"Time to consequence: {_fmt(mid)} (mid estimate).",
        answer=" ".join(parts),
        evidence_refs=refs,
        cited_signals=[tag_id] if tag_id else [],
        limitations=["Advisory projection only. Not a control signal or trip trigger."],
    )


def _explain_situation(message: str, ctx: AIContext) -> AIResponse:
    ep = ctx.latest_evidence_packet
    calm = ctx.calm_card
    sit = ctx.active_situation

    if not ep and not sit:
        return _make_response(
            intent=Intent.EXPLAIN_SITUATION,
            role=ctx.role,
            summary="No active situation.",
            answer=(
                "No active Situation is currently tracked. "
                "The plant is either in a normal state or no alarms have triggered the DAG threshold."
            ),
            evidence_refs=[],
        )

    root_id = (ep or {}).get("root_asset_id") or (sit or {}).get("root_asset_id")
    sit_type = (ep or {}).get("situation_type") or (sit or {}).get("situation_type", "Active Situation")
    confidence = float((ep or {}).get("confidence", 0.5))
    why = (calm or {}).get("why_it_matters", "")
    alarm_count = len((ep or {}).get("grouped_alarm_ids", []))

    parts = [f"Active situation: {sit_type}."]
    if root_id:
        parts.append(f"Root asset: {root_id}.")
    if alarm_count:
        parts.append(f"{alarm_count} alarm(s) grouped into this Situation.")
    if why:
        parts.append(f"Why it matters: {why}")
    parts.append(
        f"Confidence: {confidence:.0%}. "
        "Based on approved causal graph only."
    )

    refs = []
    if ep:
        refs.append(
            EvidenceRef(
                ref_type="evidence_packet",
                ref_id=ep.get("evidence_id", ""),
                quote_or_value=sit_type,
                timestamp=ep.get("ts", ""),
            )
        )

    return _make_response(
        intent=Intent.EXPLAIN_SITUATION,
        role=ctx.role,
        summary=f"{sit_type} active on {root_id}." if root_id else sit_type,
        answer=" ".join(parts),
        evidence_refs=refs,
        cited_assets=[root_id] if root_id else [],
        confidence=confidence,
    )


def _draft_graph_change(message: str, ctx: AIContext) -> AIResponse:
    """Redirect graph change drafts to the agent draft pipeline.

    Returns guidance pointing to POST /api/agents/graph-draft with evidence_packet.
    The actual candidate generation happens there.
    """
    ep = ctx.latest_evidence_packet
    refs = []
    if ep:
        refs.append(
            EvidenceRef(
                ref_type="evidence_packet",
                ref_id=ep.get("evidence_id", ""),
                quote_or_value="source for candidate generation",
            )
        )

    return _make_response(
        intent=Intent.DRAFT_GRAPH_CHANGE,
        role=ctx.role,
        summary="Graph change draft redirects to agent pipeline.",
        answer=(
            "To propose a causal edge change, use the Agent Graph Draft pipeline. "
            "POST /api/agents/graph-draft with the current evidence_packet in context. "
            "Candidates will be derived deterministically from alarm ordering. "
            "All proposed edges require human approval before runtime use."
        ),
        evidence_refs=refs,
        requires_human_approval=True,
        limitations=["Proposed edges must pass graph_patch validation before entering authored bundle."],
    )


def _draft_signal_template(message: str, ctx: AIContext) -> AIResponse:
    """Generate a draft signal template based on the asset type inferred from the message."""
    asset_type = _infer_asset_type(message)
    template = _get_builtin_template(asset_type)

    return _make_response(
        intent=Intent.DRAFT_SIGNAL_TEMPLATE,
        role=ctx.role,
        summary=f"Draft signal template for {asset_type}.",
        answer=(
            f"Signal template for asset type '{asset_type}'. "
            "This is a draft only — it does not modify the plant model. "
            "Review and apply via POST /api/ai/drafts/apply-template after engineering validation."
        ),
        evidence_refs=[
            EvidenceRef(
                ref_type="action",
                ref_id=f"template_{asset_type}",
                quote_or_value=f"built-in template for {asset_type}",
            )
        ],
        draft_artifact={
            "artifact_type": "signal_template_draft",
            "asset_type": asset_type,
            "template": template,
            "requires_human_approval": True,
            "validation_status": "pending",
        },
        requires_human_approval=True,
        limitations=["Draft only. Apply via template pipeline after engineering sign-off."],
    )


def _draft_scenario(message: str, ctx: AIContext) -> AIResponse:
    asset_type = _infer_asset_type(message)
    ep = ctx.latest_evidence_packet

    refs = []
    if ep:
        refs.append(
            EvidenceRef(
                ref_type="evidence_packet",
                ref_id=ep.get("evidence_id", ""),
                quote_or_value="source for scenario structure",
            )
        )

    scenario_template = _get_builtin_scenario_template(asset_type, ep)

    return _make_response(
        intent=Intent.DRAFT_SCENARIO,
        role=ctx.role,
        summary=f"Draft scenario for {asset_type} fault.",
        answer=(
            f"Draft regression scenario for '{asset_type}' fault pattern. "
            "Events are structured from known fault signatures and current evidence. "
            "Review in Studio before adding to scenarios.json."
        ),
        evidence_refs=refs,
        draft_artifact={
            "artifact_type": "scenario_draft",
            "asset_type": asset_type,
            "scenario": scenario_template,
            "requires_human_approval": True,
            "validation_status": "pending",
        },
        requires_human_approval=True,
        limitations=["Draft only. Must be validated through scenario regression harness."],
    )


def _draft_action_envelope(message: str, ctx: AIContext) -> AIResponse:
    ep = ctx.latest_evidence_packet
    sit_type = (ep or {}).get("situation_type") or "UNKNOWN_SITUATION"

    refs = []
    if ep:
        refs.append(
            EvidenceRef(
                ref_type="evidence_packet",
                ref_id=ep.get("evidence_id", ""),
                quote_or_value="situation source",
            )
        )

    return _make_response(
        intent=Intent.DRAFT_ACTION_ENVELOPE,
        role=ctx.role,
        summary=f"Draft action envelope entry for {sit_type}.",
        answer=(
            f"Draft action envelope entry for situation '{sit_type}'. "
            "Specify the action id, label, risk level, allowed roles, requires_isolation, "
            "and blocked_if conditions. Submit via agent draft pipeline for engineer approval."
        ),
        evidence_refs=refs,
        draft_artifact={
            "artifact_type": "action_envelope_draft",
            "situation_id": sit_type,
            "template": {
                "id": f"ACTION_{sit_type}",
                "label": "Inspect and isolate root asset",
                "situation_ids": [sit_type],
                "allowed_roles": ["operator", "maintenance"],
                "risk_level": "medium",
                "requires_isolation": True,
                "plc_permission_required": False,
                "blocked_if": [],
                "blocked_message": "",
            },
            "requires_human_approval": True,
            "validation_status": "pending",
        },
        requires_human_approval=True,
    )


def _compare_model_diff(message: str, ctx: AIContext) -> AIResponse:
    edges = ctx.graph_edges
    edge_count = len(edges)
    agent_proposed = [e for e in edges if e.get("provenance") == "agent_proposed"]
    approved = [e for e in edges if e.get("approved")]

    parts = [
        f"Current compiled graph: {edge_count} edge(s), "
        f"{len(approved)} approved, {len(agent_proposed)} agent-proposed (pending)."
    ]
    if agent_proposed:
        parts.append(
            f"Pending agent proposals: "
            + ", ".join(f"{e.get('from')}→{e.get('to')}" for e in agent_proposed[:5])
        )
        parts.append(
            "These edges require runtime approval via "
            "POST /api/agents/graph-edges/{id}/approve-runtime."
        )

    refs = [
        EvidenceRef(
            ref_type="edge",
            ref_id=e.get("id", ""),
            quote_or_value=e.get("provenance", ""),
        )
        for e in agent_proposed[:5]
    ]

    return _make_response(
        intent=Intent.COMPARE_MODEL_DIFF,
        role=ctx.role,
        summary=f"{edge_count} edges, {len(agent_proposed)} pending approval.",
        answer=" ".join(parts),
        evidence_refs=refs,
        cited_edges=[e.get("id", "") for e in agent_proposed],
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_response(
    *,
    intent: Intent,
    role: str,
    summary: str,
    answer: str,
    evidence_refs: list[EvidenceRef] | None = None,
    cited_signals: list[str] | None = None,
    cited_alarms: list[str] | None = None,
    cited_assets: list[str] | None = None,
    cited_edges: list[str] | None = None,
    proposed_actions: list[dict[str, Any]] | None = None,
    limitations: list[str] | None = None,
    confidence: float = 0.0,
    requires_human_approval: bool = False,
    draft_artifact: dict[str, Any] | None = None,
) -> AIResponse:
    now = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    return AIResponse(
        response_id=f"AIR_{uuid.uuid4().hex[:10].upper()}",
        intent=str(intent),
        role=role,
        summary=summary,
        answer=answer,
        evidence_refs=evidence_refs or [],
        cited_signals=cited_signals or [],
        cited_alarms=cited_alarms or [],
        cited_assets=cited_assets or [],
        cited_edges=cited_edges or [],
        proposed_actions=proposed_actions or [],
        limitations=limitations or [],
        confidence=confidence,
        requires_human_approval=requires_human_approval,
        created_at=now,
        draft_artifact=draft_artifact,
    )


def _refusal_response(*, intent: Intent, role: str, reason: str) -> AIResponse:
    return _make_response(
        intent=intent,
        role=role,
        summary="Request refused.",
        answer=reason,
        limitations=[reason],
    )


def _no_evidence_response(intent: Intent, role: str) -> AIResponse:
    return _make_response(
        intent=intent,
        role=role,
        summary="No active evidence available.",
        answer=(
            "No active RuntimeEvidencePacket found. "
            "This answer requires live plant data with at least one active alarm situation. "
            "Start the simulator or connect the gateway to generate evidence."
        ),
        limitations=["Insufficient evidence. Start simulator or connect gateway."],
    )


def _infer_asset_type(message: str) -> str:
    msg = message.lower()
    for kw, atype in (
        ("fan", "fan"),
        ("blower", "blower"),
        ("motor", "motor"),
        ("battery", "battery"),
        ("dc.?bus", "dc_bus"),
        ("charger", "charger"),
        ("inverter", "inverter"),
        ("airflow", "airflow_duct"),
    ):
        if re.search(kw, msg):
            return atype
    return "motor"  # safe default


def _get_builtin_template(asset_type: str) -> dict[str, Any]:
    templates: dict[str, dict[str, Any]] = {
        "motor": {
            "required_tags": [
                {"suffix": "_I", "signal_name": "Phase Current", "unit": "A", "data_type": "float"},
                {"suffix": "_RPM", "signal_name": "Speed", "unit": "rpm", "data_type": "float"},
                {"suffix": "_TEMP", "signal_name": "Winding Temperature", "unit": "C", "data_type": "float"},
            ],
            "optional_tags": [
                {"suffix": "_VIB", "signal_name": "Vibration RMS", "unit": "mm/s", "data_type": "float"},
            ],
            "default_alarms": [
                {"suffix": "CURRENT_HIGH", "op": "gt", "threshold": 3.5, "severity": "critical"},
                {"suffix": "RPM_LOW", "op": "lt", "threshold": 800, "severity": "warning"},
                {"suffix": "TEMP_HIGH", "op": "gt", "threshold": 80, "severity": "critical"},
                {"suffix": "VIB_HIGH", "op": "gt", "threshold": 4.0, "severity": "warning"},
            ],
        },
        "fan": {
            "required_tags": [
                {"suffix": "_I", "signal_name": "Current", "unit": "A", "data_type": "float"},
                {"suffix": "_RPM", "signal_name": "Speed", "unit": "rpm", "data_type": "float"},
                {"suffix": "_AIRFLOW", "signal_name": "Airflow", "unit": "m3/h", "data_type": "float"},
            ],
            "optional_tags": [],
            "default_alarms": [
                {"suffix": "CURRENT_HIGH", "op": "gt", "threshold": 2.5, "severity": "warning"},
                {"suffix": "AIRFLOW_LOW", "op": "lt", "threshold": 20, "severity": "critical"},
            ],
        },
        "blower": {
            "required_tags": [
                {"suffix": "_I", "signal_name": "Current", "unit": "A", "data_type": "float"},
                {"suffix": "_RPM", "signal_name": "Speed", "unit": "rpm", "data_type": "float"},
                {"suffix": "_VIB", "signal_name": "Vibration", "unit": "mm/s", "data_type": "float"},
                {"suffix": "_TEMP", "signal_name": "Bearing Temperature", "unit": "C", "data_type": "float"},
                {"suffix": "_AIRFLOW", "signal_name": "Airflow", "unit": "m3/h", "data_type": "float"},
            ],
            "optional_tags": [],
            "default_alarms": [
                {"suffix": "VIB_HIGH", "op": "gt", "threshold": 3.0, "severity": "critical"},
                {"suffix": "TEMP_HIGH", "op": "gt", "threshold": 65, "severity": "critical"},
                {"suffix": "CURRENT_HIGH", "op": "gt", "threshold": 3.5, "severity": "warning"},
            ],
        },
        "battery": {
            "required_tags": [
                {"suffix": "_V", "signal_name": "Terminal Voltage", "unit": "V", "data_type": "float"},
                {"suffix": "_I", "signal_name": "Current", "unit": "A", "data_type": "float"},
                {"suffix": "_SOC", "signal_name": "State of Charge", "unit": "%", "data_type": "float"},
                {"suffix": "_TEMP", "signal_name": "Cell Temperature", "unit": "C", "data_type": "float"},
            ],
            "optional_tags": [],
            "default_alarms": [
                {"suffix": "V_LOW", "op": "lt", "threshold": 43.0, "severity": "critical"},
                {"suffix": "SOC_LOW", "op": "lt", "threshold": 20, "severity": "warning"},
                {"suffix": "TEMP_HIGH", "op": "gt", "threshold": 45, "severity": "critical"},
            ],
        },
        "dc_bus": {
            "required_tags": [
                {"suffix": "_V", "signal_name": "Bus Voltage", "unit": "V", "data_type": "float"},
                {"suffix": "_I", "signal_name": "Bus Current", "unit": "A", "data_type": "float"},
            ],
            "optional_tags": [],
            "default_alarms": [
                {"suffix": "V_LOW", "op": "lt", "threshold": 42.0, "severity": "critical"},
            ],
        },
        "charger": {
            "required_tags": [
                {"suffix": "_V", "signal_name": "Output Voltage", "unit": "V", "data_type": "float"},
                {"suffix": "_I", "signal_name": "Output Current", "unit": "A", "data_type": "float"},
            ],
            "optional_tags": [],
            "default_alarms": [
                {"suffix": "CURRENT_LOW", "op": "lt", "threshold": 0.5, "severity": "warning"},
            ],
        },
    }
    return templates.get(asset_type, templates["motor"])


def _get_builtin_scenario_template(
    asset_type: str, ep: dict[str, Any] | None
) -> dict[str, Any]:
    situation_map = {
        "motor": "MOTOR_MECHANICAL_OVERLOAD",
        "fan": "FAN_AIRFLOW_BLOCKAGE",
        "blower": "BLOWER_BEARING_WEAR",
        "battery": "BATTERY_SUPPLY_WEAKNESS",
        "charger": "CHARGER_FAILURE",
        "dc_bus": "DC_BUS_UNDERVOLTAGE",
    }
    return {
        "id": f"scn_draft_{asset_type}_fault",
        "name": f"Draft: {asset_type.replace('_', ' ').title()} Fault",
        "description": (
            f"Regression scenario for {asset_type} fault pattern. "
            "Review and adjust thresholds before adding to scenarios.json."
        ),
        "duration_ms": 12000,
        "expected_situation": situation_map.get(asset_type),
        "expected_root_cause": None,
        "expected_alarms": [],
        "events": [
            {"at_ms": 0, "action": "set", "tag": f"DRAFT_{asset_type.upper()}_TAG", "value": 0, "unit": "unit"},
        ],
        "note": "Draft — replace tags and thresholds with actual asset tags.",
    }
