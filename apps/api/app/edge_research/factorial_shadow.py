"""Bounded physics-informed factorial temporal inference for shadow experiments.

The engine is deliberately small and deterministic: no training, graph mutation, I/O,
or LLM calls occur here. Learned evidence models may eventually provide likelihood
ratios, but this layer only performs bounded temporal fusion, novelty gating, and
calibrated abstention for offline/replay evaluation.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Mapping, Sequence


@dataclass(frozen=True, slots=True)
class EdgeEpoch:
    mode: str
    features: Mapping[str, float]
    quality: Mapping[str, float]


@dataclass(frozen=True, slots=True)
class FaultEvidenceSpec:
    fault_id: str
    supports: Mapping[str, float]
    contradicts: Mapping[str, float]
    onset_log_prior: float = -4.0
    clear_log_prior: float = -5.0


@dataclass(frozen=True, slots=True)
class ApprovedFaultEdge:
    cause: str
    effect: str
    weight: float = 0.5
    min_delay_epochs: int = 0
    max_delay_epochs: int = 5
    approved: bool = True


@dataclass(frozen=True, slots=True)
class EvidenceContribution:
    fault_id: str
    feature: str
    kind: str
    value: float
    quality: float
    weighted_score: float


@dataclass(frozen=True, slots=True)
class CandidateExplanation:
    faults: tuple[str, ...]
    evidence: tuple[EvidenceContribution, ...]
    causal_edges: tuple[str, ...]
    transition: str
    graph_score: float


@dataclass(frozen=True, slots=True)
class JointState:
    mask: int
    faults: tuple[str, ...]
    probability: float
    score: float


@dataclass(frozen=True, slots=True)
class ShadowDecision:
    decision: str
    mode: str
    marginals: Mapping[str, float]
    top_states: tuple[JointState, ...]
    novelty_score: float
    effective_quality: float
    abstention_reasons: tuple[str, ...]
    explanations: tuple[CandidateExplanation, ...]


class FactorialShadowEngine:
    """Top-K factorial filter with deterministic ordering and explicit rejection."""

    def __init__(
        self,
        specs: Sequence[FaultEvidenceSpec],
        *,
        beam_width: int = 16,
        novelty_threshold: float = 9.0,
        accept_probability: float = 0.75,
        minimum_quality: float = 0.7,
        maximum_active_faults: int = 3,
        approved_edges: Sequence[ApprovedFaultEdge] = (),
    ) -> None:
        if not specs or len(specs) > 10:
            raise ValueError("factorial shadow engine supports 1..10 faults")
        if beam_width < 1:
            raise ValueError("beam_width must be positive")
        self._specs = tuple(specs)
        self._beam_width = beam_width
        self._novelty_threshold = novelty_threshold
        self._accept_probability = accept_probability
        self._minimum_quality = minimum_quality
        self._maximum_active_faults = maximum_active_faults
        self._fault_index = {spec.fault_id: index for index, spec in enumerate(self._specs)}
        self._edges = self._validate_edges(tuple(approved_edges))
        self._beam: tuple[tuple[int, float], ...] = ((0, 0.0),)
        self._tick = 0
        self._active_since: dict[str, int] = {}

    def reset(self) -> None:
        self._beam = ((0, 0.0),)
        self._tick = 0
        self._active_since.clear()

    def update(
        self,
        epoch: EdgeEpoch,
        *,
        healthy_center: Mapping[str, float] | None = None,
        healthy_scale: Mapping[str, float] | None = None,
    ) -> ShadowDecision:
        self._tick += 1
        previous_top_mask = self._beam[0][0] if self._beam else 0
        quality = self._effective_quality(epoch)
        novelty = self._novelty(epoch, healthy_center or {}, healthy_scale or {})
        emissions = tuple(self._emission(spec, epoch) for spec in self._specs)
        candidates: dict[int, float] = {}
        for previous_mask, previous_score in self._beam:
            for mask in self._neighbors(previous_mask):
                score = (
                    previous_score
                    + self._transition(previous_mask, mask)
                    + self._score_mask(mask, emissions)
                    + self._graph_compatibility(mask)
                )
                if score > candidates.get(mask, -math.inf):
                    candidates[mask] = score
        ranked = sorted(candidates.items(), key=lambda item: (-item[1], item[0]))[
            : self._beam_width
        ]
        normalizer = self._logsumexp(score for _, score in ranked)
        probabilities = tuple((mask, math.exp(score - normalizer), score) for mask, score in ranked)
        # Renormalize every epoch so historical score magnitude cannot swamp new evidence.
        self._beam = tuple((mask, math.log(max(probability, 1e-300))) for mask, probability, _ in probabilities)
        marginals = {
            spec.fault_id: sum(p for mask, p, _ in probabilities if mask & (1 << index))
            for index, spec in enumerate(self._specs)
        }
        states = tuple(
            JointState(
                mask=mask,
                faults=tuple(
                    spec.fault_id for index, spec in enumerate(self._specs) if mask & (1 << index)
                ),
                probability=probability,
                score=score,
            )
            for mask, probability, score in probabilities[:5]
        )
        reasons: list[str] = []
        if quality < self._minimum_quality:
            reasons.append("INSUFFICIENT_DATA")
        if novelty > self._novelty_threshold:
            reasons.append("UNKNOWN_FAULT")
        best_fault_probability = max(marginals.values(), default=0.0)
        if best_fault_probability < self._accept_probability and states[0].mask != 0:
            reasons.append("AMBIGUOUS_POSTERIOR")
        if reasons:
            decision = reasons[0]
        elif states[0].mask == 0:
            decision = "HEALTHY"
        else:
            decision = "KNOWN_FAULT"
        top_mask = states[0].mask
        self._update_active_since(top_mask)
        explanations = tuple(
            self._explain(state.mask, previous_top_mask, epoch) for state in states[:3]
        )
        return ShadowDecision(
            decision=decision,
            mode=epoch.mode,
            marginals=marginals,
            top_states=states,
            novelty_score=novelty,
            effective_quality=quality,
            abstention_reasons=tuple(reasons),
            explanations=explanations,
        )

    def _validate_edges(
        self, edges: tuple[ApprovedFaultEdge, ...]
    ) -> tuple[ApprovedFaultEdge, ...]:
        adjacency: dict[str, list[str]] = {fault: [] for fault in self._fault_index}
        for edge in edges:
            if not edge.approved:
                raise ValueError(f"unapproved edge rejected: {edge.cause}->{edge.effect}")
            if edge.cause not in adjacency or edge.effect not in adjacency:
                raise ValueError(f"edge references unknown fault: {edge.cause}->{edge.effect}")
            if edge.cause == edge.effect:
                raise ValueError("fault DAG cannot contain self edges")
            if edge.min_delay_epochs < 0 or edge.max_delay_epochs < edge.min_delay_epochs:
                raise ValueError("invalid propagation delay bounds")
            adjacency[edge.cause].append(edge.effect)
        visiting: set[str] = set()
        visited: set[str] = set()

        def visit(node: str) -> None:
            if node in visiting:
                raise ValueError("fault graph must be acyclic")
            if node in visited:
                return
            visiting.add(node)
            for child in adjacency[node]:
                visit(child)
            visiting.remove(node)
            visited.add(node)

        for fault in adjacency:
            visit(fault)
        return tuple(sorted(edges, key=lambda edge: (edge.cause, edge.effect)))

    def _graph_compatibility(self, mask: int) -> float:
        score = 0.0
        for edge in self._edges:
            cause_on = bool(mask & (1 << self._fault_index[edge.cause]))
            effect_on = bool(mask & (1 << self._fault_index[edge.effect]))
            if effect_on and not cause_on:
                score -= abs(edge.weight)
            elif cause_on and effect_on:
                onset = self._active_since.get(edge.cause, self._tick)
                delay = self._tick - onset
                if edge.min_delay_epochs <= delay <= edge.max_delay_epochs:
                    score += abs(edge.weight)
                elif delay > edge.max_delay_epochs:
                    score -= abs(edge.weight) * 0.5
        return score

    def _update_active_since(self, mask: int) -> None:
        active = {
            spec.fault_id for index, spec in enumerate(self._specs) if mask & (1 << index)
        }
        for fault in active:
            self._active_since.setdefault(fault, self._tick)
        for fault in tuple(self._active_since):
            if fault not in active:
                del self._active_since[fault]

    def _explain(
        self,
        mask: int,
        previous_mask: int,
        epoch: EdgeEpoch,
    ) -> CandidateExplanation:
        faults = tuple(
            spec.fault_id for index, spec in enumerate(self._specs) if mask & (1 << index)
        )
        evidence: list[EvidenceContribution] = []
        for index, spec in enumerate(self._specs):
            if not mask & (1 << index):
                continue
            for kind, mapping, sign in (
                ("support", spec.supports, 1.0),
                ("contradiction", spec.contradicts, -1.0),
            ):
                for feature, weight in mapping.items():
                    value = float(epoch.features.get(feature, 0.0))
                    quality = self._feature_quality(epoch, feature)
                    weighted = sign * weight * (abs(value) if sign < 0 else value) * quality
                    if weighted:
                        evidence.append(
                            EvidenceContribution(
                                fault_id=spec.fault_id,
                                feature=feature,
                                kind=kind,
                                value=value,
                                quality=quality,
                                weighted_score=weighted,
                            )
                        )
        evidence.sort(key=lambda item: (-abs(item.weighted_score), item.fault_id, item.feature))
        causal_edges = tuple(
            f"{edge.cause}->{edge.effect}"
            for edge in self._edges
            if edge.cause in faults and edge.effect in faults
        )
        added = tuple(
            spec.fault_id
            for index, spec in enumerate(self._specs)
            if mask & (1 << index) and not previous_mask & (1 << index)
        )
        cleared = tuple(
            spec.fault_id
            for index, spec in enumerate(self._specs)
            if previous_mask & (1 << index) and not mask & (1 << index)
        )
        transition = f"added={','.join(added) or '-'};cleared={','.join(cleared) or '-'}"
        return CandidateExplanation(
            faults=faults,
            evidence=tuple(evidence),
            causal_edges=causal_edges,
            transition=transition,
            graph_score=self._graph_compatibility(mask),
        )

    def _neighbors(self, mask: int) -> tuple[int, ...]:
        values = {mask}
        for index in range(len(self._specs)):
            candidate = mask ^ (1 << index)
            if candidate.bit_count() <= self._maximum_active_faults:
                values.add(candidate)
        return tuple(sorted(values))

    def _transition(self, previous: int, current: int) -> float:
        score = 0.0
        changed = previous ^ current
        for index, spec in enumerate(self._specs):
            bit = 1 << index
            if not changed & bit:
                continue
            score += spec.onset_log_prior if current & bit else spec.clear_log_prior
        return score

    @staticmethod
    def _feature_quality(epoch: EdgeEpoch, feature: str) -> float:
        return min(1.0, max(0.0, float(epoch.quality.get(feature, 0.0))))

    def _emission(self, spec: FaultEvidenceSpec, epoch: EdgeEpoch) -> float:
        support = sum(
            weight * float(epoch.features.get(feature, 0.0)) * self._feature_quality(epoch, feature)
            for feature, weight in spec.supports.items()
        )
        contradiction = sum(
            weight * abs(float(epoch.features.get(feature, 0.0))) * self._feature_quality(epoch, feature)
            for feature, weight in spec.contradicts.items()
        )
        return max(-math.log(20.0), min(math.log(20.0), support - contradiction))

    @staticmethod
    def _score_mask(mask: int, emissions: Sequence[float]) -> float:
        return sum(value if mask & (1 << index) else -0.2 * max(value, 0.0) for index, value in enumerate(emissions))

    @staticmethod
    def _effective_quality(epoch: EdgeEpoch) -> float:
        if not epoch.quality:
            return 0.0
        return min(min(1.0, max(0.0, float(value))) for value in epoch.quality.values())

    @staticmethod
    def _novelty(
        epoch: EdgeEpoch,
        center: Mapping[str, float],
        scale: Mapping[str, float],
    ) -> float:
        weighted = 0.0
        weight_sum = 0.0
        for feature, expected in center.items():
            quality = min(1.0, max(0.0, float(epoch.quality.get(feature, 0.0))))
            sigma = max(abs(float(scale.get(feature, 1.0))), 1e-6)
            residual = (float(epoch.features.get(feature, expected)) - expected) / sigma
            # Student-t-like bounded influence: grows logarithmically for extreme points.
            weighted += quality * math.log1p((residual * residual) / 4.0)
            weight_sum += quality
        return weighted / weight_sum if weight_sum else math.inf

    @staticmethod
    def _logsumexp(values: Sequence[float] | object) -> float:
        materialized = tuple(values)  # type: ignore[arg-type]
        maximum = max(materialized)
        return maximum + math.log(sum(math.exp(value - maximum) for value in materialized))
