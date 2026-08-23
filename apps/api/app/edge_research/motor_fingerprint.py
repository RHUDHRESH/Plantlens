"""Tiny physics-informed one-class motor fingerprint for edge shadow inference.

The model is intentionally dependency-free so it can run on the UNO Q.  It
learns operating prototypes from coherent voltage/current/power samples and
uses an RBF similarity plus a power-balance invariant.  Output is advisory
shadow evidence only; it is not part of PlantLens runtime diagnosis.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import asdict, dataclass
from typing import Sequence


@dataclass(frozen=True, slots=True)
class ElectricalSample:
    voltage: float
    current: float
    power: float


@dataclass(frozen=True, slots=True)
class MotorPrototype:
    prototype_id: str
    voltage: float
    current: float
    power: float


@dataclass(frozen=True, slots=True)
class FingerprintResult:
    decision: str
    matched_prototype: str
    similarity: float
    novelty_score: float
    confidence: float
    power_balance_error: float
    contributors: tuple[tuple[str, float], ...]
    model_sha256: str


class MotorFingerprintModel:
    """Mode-aware RBF one-class classifier with an electrical invariant."""

    def __init__(self, prototypes: Sequence[MotorPrototype], *, trained_samples: int) -> None:
        if not prototypes:
            raise ValueError("at least one motor prototype is required")
        self.prototypes = tuple(prototypes)
        self.trained_samples = trained_samples
        profile = {
            "model_type": "physics_informed_rbf_one_class",
            "version": "motor-fingerprint-v0.1-shadow",
            "trained_samples": trained_samples,
            "prototypes": [asdict(item) for item in self.prototypes],
        }
        self.model_sha256 = hashlib.sha256(
            json.dumps(profile, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()

    @classmethod
    def fit(cls, samples: Sequence[ElectricalSample], modes: int = 3) -> "MotorFingerprintModel":
        """Fit deterministic load-mode prototypes using 1-D log-current k-means."""

        clean = [
            sample
            for sample in samples
            if sample.voltage > 0 and sample.current > 0 and sample.power > 0
            and all(math.isfinite(value) for value in asdict(sample).values())
        ]
        if not clean:
            raise ValueError("no valid electrical samples")
        count = min(max(1, modes), len(clean))
        ordered = sorted(clean, key=lambda item: item.current)
        seeds = [
            math.log(ordered[round(index * (len(ordered) - 1) / max(1, count - 1))].current)
            for index in range(count)
        ]
        assignments = [0] * len(clean)
        for _ in range(12):
            assignments = [
                min(range(count), key=lambda index: abs(math.log(sample.current) - seeds[index]))
                for sample in clean
            ]
            updated = []
            for index in range(count):
                members = [sample for sample, group in zip(clean, assignments, strict=True) if group == index]
                updated.append(
                    sum(math.log(sample.current) for sample in members) / len(members)
                    if members else seeds[index]
                )
            if updated == seeds:
                break
            seeds = updated

        prototypes = []
        for index in range(count):
            members = [sample for sample, group in zip(clean, assignments, strict=True) if group == index]
            if not members:
                continue
            prototypes.append(
                MotorPrototype(
                    prototype_id=f"load_mode_{index + 1}",
                    voltage=sum(item.voltage for item in members) / len(members),
                    current=sum(item.current for item in members) / len(members),
                    power=sum(item.power for item in members) / len(members),
                )
            )
        prototypes.sort(key=lambda item: item.current)
        prototypes = [
            MotorPrototype(f"load_mode_{index + 1}", item.voltage, item.current, item.power)
            for index, item in enumerate(prototypes)
        ]
        return cls(prototypes, trained_samples=len(clean))

    def infer(self, sample: ElectricalSample, *, data_quality: float = 1.0) -> FingerprintResult:
        quality = min(1.0, max(0.0, data_quality))
        candidates = [(self._distance(sample, prototype), prototype) for prototype in self.prototypes]
        distance, prototype = min(candidates, key=lambda item: item[0])
        similarity = math.exp(-0.5 * distance * distance)
        novelty = 1.0 - similarity
        balance_error = abs(sample.power - sample.voltage * sample.current) / max(abs(sample.power), 1e-9)
        physics_confidence = max(0.0, 1.0 - min(1.0, balance_error / 0.10))
        confidence = similarity * physics_confidence * quality
        if quality < 0.7:
            decision = "ABSTAIN_LOW_QUALITY"
        elif balance_error > 0.10:
            decision = "ABSTAIN_MAPPING_OR_SENSOR"
        elif novelty >= 0.80:
            decision = "UNKNOWN_SIGNATURE"
        elif novelty >= 0.50:
            decision = "SIGNATURE_DRIFT"
        else:
            decision = "KNOWN_SIGNATURE"
        contributors = sorted(
            (
                ("voltage_deviation", abs(sample.voltage - prototype.voltage) / 0.75),
                ("current_log_deviation", abs(math.log(sample.current / prototype.current)) / 0.55),
                ("power_log_deviation", abs(math.log(sample.power / prototype.power)) / 0.55),
                ("power_balance_error", balance_error / 0.10),
            ),
            key=lambda item: (-item[1], item[0]),
        )
        return FingerprintResult(
            decision=decision,
            matched_prototype=prototype.prototype_id,
            similarity=similarity,
            novelty_score=novelty,
            confidence=confidence,
            power_balance_error=balance_error,
            contributors=tuple(contributors),
            model_sha256=self.model_sha256,
        )

    @staticmethod
    def _distance(sample: ElectricalSample, prototype: MotorPrototype) -> float:
        voltage_delta = (sample.voltage - prototype.voltage) / 0.75
        current_delta = math.log(sample.current / prototype.current) / 0.55
        power_delta = math.log(sample.power / prototype.power) / 0.55
        return math.sqrt((voltage_delta**2 + current_delta**2 + power_delta**2) / 3.0)
