"""Layer 3a — Known Fault Scoring (Domain E). Closed-world evidence engine.

Confidence(F) = clamp( sum_i w_i * match_i * kappa(q_i) / sum_i w_i , 0, 1)
  match_i in {+1 exact, +0.5 partial, 0 no data, -1 contradicts}
  kappa(q)  in {1 good, 0.5 uncertain, 0 bad}  (see schemas.canonical.QUALITY_KAPPA)

Defensible guards:
  - Contradiction veto: any required symptom contradicts at good quality
    (match=-1, kappa=1) -> fault hard-capped/ruled out regardless of agreement.
  - Coverage reported SEPARATELY: Coverage(F) = sum w_i(has data) / sum w_i(all).
    Report both numbers; 92% conf at 35% coverage = "likely but unconfirmed".
  - Noisy-OR is the back-pocket probabilistic upgrade (not shipped by default).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from ..schemas.canonical import QUALITY_KAPPA
from ..schemas.faults import FaultSpec
from .state_estimation import EstimatedState

MatchScore = Literal[-1.0, -0.5, 0.0, 0.5, 1.0]


@dataclass
class SymptomMatch:
    signal: str
    match: float  # MatchScore (-1..1)
    kappa: float
    weight: float
    required: bool


@dataclass
class FaultScore:
    fault_id: str
    label: str
    confidence: float  # 0..1
    coverage: float    # 0..1
    contradicted: bool
    matches: list[SymptomMatch]


def score_fault(fault: FaultSpec, states: dict[str, EstimatedState]) -> FaultScore:
    """Score one fault against current estimated states (scaffold: returns zeros)."""
    total_w = sum(s.weight for s in fault.symptoms) or 1.0
    covered_w = 0.0
    acc = 0.0
    contradicted = False
    matches: list[SymptomMatch] = []
    for sym in fault.symptoms:
        st = states.get(sym.signal)
        if st is None or st.band.value == "unknown":
            matches.append(SymptomMatch(sym.signal, 0.0, 0.0, sym.weight, sym.required))
            continue
        covered_w += sym.weight
        kappa = QUALITY_KAPPA.get(st.band.value if hasattr(st.band, "value") else st.band, 1.0)
        # Scaffold: treat high/rising as +1 match for any expected direction.
        match: float = 1.0
        acc += sym.weight * match * kappa
        if sym.required and match == -1.0 and kappa == 1.0:
            contradicted = True
        matches.append(SymptomMatch(sym.signal, match, kappa, sym.weight, sym.required))
    conf = max(0.0, min(1.0, acc / total_w)) if not contradicted else 0.0
    return FaultScore(fault.id, fault.label, conf, covered_w / total_w,
                      contradicted, matches)


def score_all(faults: list[FaultSpec], states: dict[str, EstimatedState]) -> list[FaultScore]:
    """Rank faults by confidence (coverage shown beside, never folded in)."""
    return sorted([score_fault(f, states) for f in faults],
                  key=lambda s: s.confidence, reverse=True)
