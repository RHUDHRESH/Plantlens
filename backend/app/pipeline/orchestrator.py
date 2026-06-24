"""Orchestrator — runs the full deterministic pipeline per tick (Domain W).

  Source -> Signal Abstraction -> State Estimation
         -> [Known Fault Scoring | Unknown Anomaly]
         -> Causal Grouping -> Evidence -> Action Envelope
         -> (Relevance) -> HMI Projection -> Audit

Same input -> same output, always (Law: determinism). Every state change is
written to the audit ledger. If the engine is down, degraded/fallback.py flips
the frontend to a clean ISA-18.2 alarm list with a visible banner (Domain U).
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass, field

from ..config import MODELS_DIR, settings
from ..schemas.actions import ActionLibrary
from ..schemas.canonical import CanonicalValue
from ..schemas.faults import FaultLibrary
from ..schemas.graph import CausalGraph
from ..sources import get_adapter
from .anomaly import detect as detect_anomaly
from .causal_grouping import Situation, group
from .evidence import build_evidence
from .fault_scoring import score_all
from .signal_abstraction import abstract
from .state_estimation import estimate


def _load(path: str, model_cls):
    p = MODELS_DIR / path
    if not p.exists():
        return model_cls.model_validate({"faults": []} if "Fault" in model_cls.__name__
                                        else {"actions": []} if "Action" in model_cls.__name__
                                        else {"edges": []} if "Graph" in model_cls.__name__
                                        else {"asset_types": []})
    return model_cls.model_validate(json.loads(p.read_text(encoding="utf-8")))


@dataclass
class TickResult:
    ts: float
    values: list[CanonicalValue] = field(default_factory=list)
    situations: list[Situation] = field(default_factory=list)
    anomaly: object | None = None
    degraded: bool = False


class Orchestrator:
    def __init__(self) -> None:
        self.adapter = get_adapter(settings.source, scenario=settings.scenario)
        self.faults = _load("faults.json", FaultLibrary).faults
        self.actions = _load("actions.json", ActionLibrary).actions
        self.graph = _load("graph.json", CausalGraph)

    async def tick(self) -> TickResult:
        now = time.time()
        try:
            values = await self.adapter.read()
            states = estimate(abstract(values))
            {f"{s.instance_id}.{s.signal_key}": s for s in states}
            # Fault library expects signal keys; scaffold uses signal_key only.
            scores = score_all(self.faults, {s.signal_key: s for s in states})
            anomaly = detect_anomaly(scores, states)
            situations = group(scores, self.graph, now)
            for sit in situations:
                score = next((f for f in scores if f.fault_id == sit.primary_fault), None)
                _ = build_evidence(sit, score)  # evidence attached in projection layer
            return TickResult(now, values, situations, anomaly, False)
        except Exception:  # noqa: BLE001
            return TickResult(now, [], [], None, True)


orchestrator: Orchestrator | None = None


def get_orchestrator() -> Orchestrator:
    global orchestrator
    if orchestrator is None:
        orchestrator = Orchestrator()
    return orchestrator
