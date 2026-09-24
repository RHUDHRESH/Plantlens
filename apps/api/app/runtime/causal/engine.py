"""Evidence-scored root-cause ranking over the approved causal structure.

For every candidate node r (an alarmed node or an approved ancestor of one):

* **T timing / first-out**: the share of r's explained alarms whose onset does not precede
  r's own first onset. An unobserved r (no own alarm) is assumed to start just before its
  earliest explained symptom and cannot be contradicted on timing.
* **C coverage**: explained alarms / alarms in scope. An alarm on a downstream node d is
  explained only if its onset falls inside the accumulated lag window along approved edges.
  Expected symptoms (node.expected_symptoms) whose window has already elapsed but which
  are absent reduce coverage too.
* **F fingerprint**: the engineer-authored evidence (evidence tags, root_cause_rules,
  fingerprint_rules, score_adjustments), floored at 0.5 when r has its own alarm.
* **Q quality**: the share of r's evidence tags that are STALE/BAD/MISSING.
* **K contradictions**: downstream alarms that began before r beyond the tolerance (effect
  before cause), or whose direction contradicts edge polarity.

``score = prior · T^wt · C^wc · F^wf · (1 − Q)^wq · contradiction_factor^K``

Roots are then chosen greedily as the smallest set that explains the alarm flood, and each
score is calibrated by its margin over the best competing explanation. Pure function of its
inputs: no mutation, no clock reads, no randomness.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from app.runtime.causal.confidence import calibrate, confidence_bucket
from app.runtime.causal.structure import CausalStructure, structure_for

DEFAULT_SCORING: dict[str, float] = {
    "w_timing": 1.0,
    "w_coverage": 1.0,
    "w_fingerprint": 1.0,
    "w_quality": 1.0,
    "contradiction_factor": 0.5,
    "unobserved_prior": 0.8,
    "timing_tolerance_ms": 250,
    "min_margin": 0.15,
    "max_roots": 3,
}

DEGRADED = {"STALE", "BAD", "MISSING"}


@dataclass(frozen=True, slots=True)
class RootScore:
    node_id: str
    score: float  # raw product in [0, 1]
    timing: float
    coverage: float
    fingerprint: float
    quality_penalty: float
    contradictions: int
    observed: bool
    onset: datetime | None
    explained: tuple[str, ...]
    unexplained: tuple[str, ...]
    contradicting: tuple[str, ...]
    missing_expected: tuple[str, ...]
    path_edges: tuple[str, ...]
    reasons: tuple[str, ...]
    loop_note: str | None


@dataclass(frozen=True, slots=True)
class RootHypothesis:
    node_id: str
    raw_score: float
    confidence: float  # calibrated by margin
    bucket: str
    margin: float
    explained: tuple[str, ...]
    competitor: str | None


def parse_ts(value: str | datetime | None) -> datetime | None:
    if value is None:
        return None
    ts = value if isinstance(value, datetime) else datetime.fromisoformat(value.replace("Z", "+00:00"))
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts


def alarm_onset(alarm: dict[str, Any]) -> datetime:
    return parse_ts(alarm.get("onset_at")) or parse_ts(alarm["raised_at"])  # type: ignore[return-value]


def alarm_direction(alarm: dict[str, Any]) -> int | None:
    comparator = (alarm.get("evidence") or {}).get("comparator")
    if comparator in {">", ">="}:
        return 1
    if comparator in {"<", "<="}:
        return -1
    return None


def scoring_params(graph_index: dict[str, Any]) -> dict[str, float]:
    params = dict(DEFAULT_SCORING)
    params.update({k: v for k, v in (graph_index.get("scoring") or {}).items() if k in params})
    return params


def deterministic_trace_id(graph_index: dict[str, Any], alarms: dict[str, dict[str, Any]]) -> str:
    material = "|".join(
        [str(graph_index.get("graph_id", ""))]
        + [f"{aid}@{alarm_onset(a).isoformat()}" for aid, a in sorted(alarms.items())]
    )
    return "TRACE_" + hashlib.sha256(material.encode()).hexdigest()[:12].upper()


def candidate_nodes(structure: CausalStructure, alarms: dict[str, dict[str, Any]]) -> list[str]:
    alarmed = {a.get("asset_id") for a in alarms.values() if a.get("asset_id")}
    nodes: set[str] = set()
    for node in alarmed:
        nodes.add(node)
        nodes |= structure.ancestors_of(node)
    return sorted(nodes)


def score_candidate(
    node_id: str,
    *,
    structure: CausalStructure,
    graph_index: dict[str, Any],
    alarms: dict[str, dict[str, Any]],
    scope: set[str],
    tags: dict[str, Any],
    params: dict[str, float],
    fingerprint_fn,
    now: datetime | None = None,
) -> RootScore:
    """Score one candidate against the alarms in ``scope`` (ids into ``alarms``)."""
    tol_ms = float(params["timing_tolerance_ms"])
    reach = structure.reach_from(node_id)
    node_cfg = graph_index.get("nodes", {}).get(node_id, {})

    own = sorted(
        (aid for aid, a in alarms.items() if a.get("asset_id") == node_id),
        key=lambda aid: (alarm_onset(alarms[aid]), aid),
    )
    observed = bool(own)
    onset = alarm_onset(alarms[own[0]]) if observed else None
    root_direction = alarm_direction(alarms[own[0]]) if observed else None

    explained: list[str] = []
    unexplained: list[str] = []
    contradicting: list[str] = []
    path_edges: list[str] = []
    reasons: list[str] = []

    # Unobserved root: anchor at the latest instant consistent with every reachable symptom.
    if onset is None:
        reachable_min = [
            alarm_onset(alarms[aid]).timestamp() * 1000 - reach[alarms[aid]["asset_id"]].min_ms
            for aid in scope
            if alarms[aid].get("asset_id") in reach
        ]
        anchor_ms = min(reachable_min) if reachable_min else None
    else:
        anchor_ms = onset.timestamp() * 1000

    for aid in sorted(scope):
        alarm = alarms[aid]
        asset = alarm.get("asset_id")
        t_ms = alarm_onset(alarm).timestamp() * 1000
        if asset == node_id:
            explained.append(aid)
            continue
        r = reach.get(asset or "")
        if r is None or anchor_ms is None:
            unexplained.append(aid)
            continue
        delta = t_ms - anchor_ms
        if delta < -tol_ms:
            contradicting.append(aid)
            reasons.append(f"{aid} began {abs(delta):.0f} ms before {node_id} (effect before cause)")
            continue
        if delta > r.max_ms + tol_ms:
            unexplained.append(aid)
            reasons.append(f"{aid} arrived {delta:.0f} ms after {node_id}, outside window ≤{r.max_ms} ms")
            continue
        direction = alarm_direction(alarm)
        if r.polarity is not None and root_direction is not None and direction is not None:
            if root_direction * r.polarity != direction:
                contradicting.append(aid)
                reasons.append(f"{aid} moved against approved edge polarity from {node_id}")
                continue
        explained.append(aid)
        for edge_id in r.path_edges:
            if edge_id not in path_edges:
                path_edges.append(edge_id)

    # Expected symptoms still absent once r's whole downstream window has elapsed.
    missing_expected: list[str] = []
    if now is not None and anchor_ms is not None:
        window_ms = max((r.max_ms for r in reach.values()), default=0)
        if now.timestamp() * 1000 - anchor_ms > window_ms + tol_ms:
            missing_expected = [e for e in node_cfg.get("expected_symptoms", []) if e not in alarms]

    n_scope = len(scope)
    denom = n_scope + len(missing_expected)
    coverage = len(explained) / denom if denom else 0.0

    if onset is None:
        timing = 1.0 if explained else 0.0
    else:
        not_before = sum(
            1 for aid in explained if alarm_onset(alarms[aid]).timestamp() * 1000 >= anchor_ms - tol_ms
        )
        timing = not_before / len(explained) if explained else 0.0

    fp_score, fp_reasons = fingerprint_fn(node_id, graph_index, tags, alarms)
    fingerprint = max(fp_score, 0.5) if observed else fp_score
    reasons.extend(fp_reasons)

    evidence_tags = node_cfg.get("evidence_tags", [])
    degraded = [t for t in evidence_tags if (f := tags.get(t)) is not None and getattr(f, "quality", "GOOD") in DEGRADED]
    quality_penalty = len(degraded) / len(evidence_tags) if evidence_tags else 0.0
    for tag_id in degraded:
        reasons.append(f"{tag_id} quality degraded")

    prior = float(node_cfg.get("prior", 1.0)) * (1.0 if observed else float(params["unobserved_prior"]))
    k = len(contradicting)
    score = (
        prior
        * timing ** params["w_timing"]
        * coverage ** params["w_coverage"]
        * fingerprint ** params["w_fingerprint"]
        * (1.0 - quality_penalty) ** params["w_quality"]
        * params["contradiction_factor"] ** k
    )

    loop_note = None
    members = structure.loop_members(node_id)
    if members:
        loop_alarms = sorted(
            (a for a in alarms.values() if a.get("asset_id") in members),
            key=lambda a: (alarm_onset(a), a["alarm_id"]),
        )
        entry = loop_alarms[0]["asset_id"] if loop_alarms else node_id
        loop_note = (
            f"{node_id} is in approved feedback loop {{{', '.join(members)}}}; "
            f"loop entered at {entry}"
        )
        reasons.append(loop_note)

    if explained:
        reasons.insert(0, f"explains {len(explained)}/{n_scope} alarms")

    return RootScore(
        node_id=node_id,
        score=max(0.0, min(1.0, score)),
        timing=timing,
        coverage=coverage,
        fingerprint=fingerprint,
        quality_penalty=quality_penalty,
        contradictions=k,
        observed=observed,
        onset=onset,
        explained=tuple(sorted(explained)),
        unexplained=tuple(sorted(unexplained)),
        contradicting=tuple(sorted(contradicting)),
        missing_expected=tuple(missing_expected),
        path_edges=tuple(path_edges),
        reasons=tuple(reasons),
        loop_note=loop_note,
    )


def rank_candidates(
    graph_index: dict[str, Any],
    alarms: dict[str, dict[str, Any]],
    tags: dict[str, Any],
    *,
    scope: set[str] | None = None,
    restrict_to: set[str] | None = None,
    fingerprint_fn,
    now: datetime | None = None,
) -> list[RootScore]:
    structure = structure_for(graph_index)
    params = scoring_params(graph_index)
    in_scope = set(alarms) if scope is None else scope
    scoped = {aid: alarms[aid] for aid in in_scope}
    nodes = candidate_nodes(structure, scoped)
    if restrict_to is not None:
        nodes = [n for n in nodes if n in restrict_to]
    scores = [
        score_candidate(
            n,
            structure=structure,
            graph_index=graph_index,
            alarms=alarms,
            scope=in_scope,
            tags=tags,
            params=params,
            fingerprint_fn=fingerprint_fn,
            now=now,
        )
        for n in nodes
    ]
    return sorted(scores, key=lambda s: (-s.score, -len(s.explained), s.node_id))


def select_roots(
    graph_index: dict[str, Any],
    alarms: dict[str, dict[str, Any]],
    tags: dict[str, Any],
    *,
    min_root_score: float,
    fingerprint_fn,
    now: datetime | None = None,
    restrict_to: set[str] | None = None,
) -> tuple[list[RootHypothesis], list[RootScore]]:
    """Greedy minimal explaining set; returns hypotheses and the first-round ranking."""
    params = scoring_params(graph_index)
    remaining = set(alarms)
    hypotheses: list[RootHypothesis] = []
    first_round: list[RootScore] = []
    while remaining and len(hypotheses) < int(params["max_roots"]):
        ranked = rank_candidates(
            graph_index,
            alarms,
            tags,
            scope=remaining,
            restrict_to=restrict_to,
            fingerprint_fn=fingerprint_fn,
            now=now,
        )
        ranked = [r for r in ranked if r.node_id not in {h.node_id for h in hypotheses}]
        if not first_round:
            first_round = ranked
        if not ranked or ranked[0].score < min_root_score or not ranked[0].explained:
            break
        top = ranked[0]
        competitor = next(
            (r for r in ranked[1:] if set(r.explained) & set(top.explained)),
            None,
        )
        margin = top.score - (competitor.score if competitor else 0.0)
        calibrated = calibrate(top.score, margin, float(params["min_margin"]))
        hypotheses.append(
            RootHypothesis(
                node_id=top.node_id,
                raw_score=top.score,
                confidence=calibrated,
                bucket=confidence_bucket(calibrated),
                margin=margin,
                explained=top.explained,
                competitor=competitor.node_id if competitor else None,
            )
        )
        remaining -= set(top.explained)
    return hypotheses, first_round
