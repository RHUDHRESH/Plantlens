"""Compact explainable ensemble for UNO Q shadow fault detection.

The model is inference-only and uses versioned expert-seeded coefficients until a
locked training corpus exists. It produces uncertainty and evidence receipts; it
does not create runtime alarms or control hardware.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Mapping, Sequence


FEATURES = (
    "current_z",
    "power_z",
    "rpm_drop_z",
    "temperature_z",
    "temperature_slope_z",
    "vibration_rms_z",
    "vibration_axis_imbalance_z",
    "voltage_sag_z",
    "mapping_error",
)


@dataclass(frozen=True, slots=True)
class EnsembleMember:
    member_id: str
    weights: Mapping[str, Mapping[str, float]]
    biases: Mapping[str, float]


@dataclass(frozen=True, slots=True)
class FaultEstimate:
    fault_id: str
    probability: float
    disagreement: float
    contributors: tuple[tuple[str, float], ...]


@dataclass(frozen=True, slots=True)
class EnsembleDecision:
    decision: str
    effective_quality: float
    novelty_score: float
    estimates: tuple[FaultEstimate, ...]
    abstention_reasons: tuple[str, ...]


def _member(member_id: str, scale: float, bias_shift: float) -> EnsembleMember:
    base = {
        "overload": {
            "current_z": 1.30,
            "power_z": 0.75,
            "rpm_drop_z": 1.05,
            "temperature_slope_z": 0.35,
            "voltage_sag_z": 0.30,
        },
        "imbalance": {
            "vibration_rms_z": 0.85,
            "vibration_axis_imbalance_z": 1.55,
            "current_z": 0.20,
        },
        "bearing_wear": {
            "vibration_rms_z": 1.25,
            "temperature_z": 0.35,
            "temperature_slope_z": 0.45,
        },
        "thermal_stress": {
            "temperature_z": 1.25,
            "temperature_slope_z": 1.10,
            "current_z": 0.30,
        },
        "sensor_fault": {
            "mapping_error": 2.10,
            "vibration_axis_imbalance_z": 0.15,
        },
    }
    return EnsembleMember(
        member_id=member_id,
        weights={
            fault: {feature: weight * scale for feature, weight in weights.items()}
            for fault, weights in base.items()
        },
        biases={fault: -3.2 + bias_shift for fault in base},
    )


DEFAULT_MEMBERS = (
    _member("physics-a", 0.94, -0.08),
    _member("physics-b", 1.00, 0.00),
    _member("physics-c", 1.07, 0.06),
    _member("physics-d", 1.02, -0.04),
    _member("physics-e", 0.98, 0.05),
)


class CompactFaultEnsemble:
    """Small logistic ensemble with deterministic uncertainty and abstention."""

    def __init__(
        self,
        members: Sequence[EnsembleMember] = DEFAULT_MEMBERS,
        *,
        accept_probability: float = 0.65,
        minimum_quality: float = 0.70,
        novelty_threshold: float = 8.0,
    ) -> None:
        if len(members) < 3:
            raise ValueError("compact ensemble requires at least three members")
        fault_sets = [set(member.weights) for member in members]
        if any(faults != fault_sets[0] for faults in fault_sets[1:]):
            raise ValueError("all ensemble members must model the same faults")
        self._members = tuple(members)
        self._faults = tuple(sorted(fault_sets[0]))
        self._accept_probability = accept_probability
        self._minimum_quality = minimum_quality
        self._novelty_threshold = novelty_threshold

    def infer(
        self,
        features: Mapping[str, float],
        quality: Mapping[str, float],
    ) -> EnsembleDecision:
        effective_quality = self._effective_quality(quality)
        novelty_score = max((abs(float(features.get(name, 0.0))) for name in FEATURES), default=0.0)
        estimates: list[FaultEstimate] = []
        for fault in self._faults:
            member_probabilities = [
                self._probability(member, fault, features, quality) for member in self._members
            ]
            probability = sum(member_probabilities) / len(member_probabilities)
            disagreement = math.sqrt(
                sum((value - probability) ** 2 for value in member_probabilities)
                / len(member_probabilities)
            )
            estimates.append(
                FaultEstimate(
                    fault_id=fault,
                    probability=probability,
                    disagreement=disagreement,
                    contributors=self._contributors(fault, features, quality),
                )
            )
        estimates.sort(key=lambda item: (-item.probability, item.fault_id))
        reasons: list[str] = []
        if effective_quality < self._minimum_quality:
            reasons.append("INSUFFICIENT_DATA")
        if novelty_score > self._novelty_threshold:
            reasons.append("UNKNOWN_FAULT")
        top_probability = estimates[0].probability if estimates else 0.0
        if reasons:
            decision = reasons[0]
        elif top_probability >= self._accept_probability:
            decision = "KNOWN_FAULT"
        else:
            decision = "HEALTHY"
        return EnsembleDecision(
            decision=decision,
            effective_quality=effective_quality,
            novelty_score=novelty_score,
            estimates=tuple(estimates),
            abstention_reasons=tuple(reasons),
        )

    @staticmethod
    def _effective_quality(quality: Mapping[str, float]) -> float:
        values = [min(1.0, max(0.0, float(quality.get(name, 0.0)))) for name in FEATURES]
        return sum(values) / len(values)

    def _probability(
        self,
        member: EnsembleMember,
        fault: str,
        features: Mapping[str, float],
        quality: Mapping[str, float],
    ) -> float:
        score = float(member.biases[fault])
        for feature, weight in member.weights[fault].items():
            q = min(1.0, max(0.0, float(quality.get(feature, 0.0))))
            score += weight * float(features.get(feature, 0.0)) * q
        if score >= 0:
            return 1.0 / (1.0 + math.exp(-score))
        exp_score = math.exp(score)
        return exp_score / (1.0 + exp_score)

    def _contributors(
        self,
        fault: str,
        features: Mapping[str, float],
        quality: Mapping[str, float],
    ) -> tuple[tuple[str, float], ...]:
        contributions: list[tuple[str, float]] = []
        for feature in FEATURES:
            weights = [member.weights[fault].get(feature, 0.0) for member in self._members]
            mean_weight = sum(weights) / len(weights)
            q = min(1.0, max(0.0, float(quality.get(feature, 0.0))))
            contribution = mean_weight * float(features.get(feature, 0.0)) * q
            if contribution:
                contributions.append((feature, contribution))
        contributions.sort(key=lambda item: (-abs(item[1]), item[0]))
        return tuple(contributions[:4])
