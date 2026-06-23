import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

import networkx as nx

from alarm_engine import AlarmEvent
from model_loader import get_model


@dataclass
class Situation:
    situation_id: str
    title: str
    severity: Literal['HIGH', 'MEDIUM', 'LOW']
    confidence: float
    root_alarm_id: str
    root_equipment_id: str
    affected_equipment: list[str]
    alarm_count: int
    alarms: list[AlarmEvent]
    edges_traversed: list[str]
    causal_path: list[str]
    projected_consequence: str
    time_to_limit_min: Optional[float]
    ts_created: str
    ts_updated: str


_G: Optional[nx.DiGraph] = None


@dataclass
class WatchWindow:
    effect_alarm_id: str
    deadline: datetime
    situation_id: str
    edge_id: str
    confidence_prior: float


_windows: dict[str, WatchWindow] = {}
_situations: dict[str, Situation] = {}


def _build_graph() -> nx.DiGraph:
    model = get_model()
    graph = nx.DiGraph()

    for node in model.graph_nodes:
        graph.add_node(node['id'], **node)

    for edge in model.graph_edges:
        graph.add_edge(
            edge.cause,
            edge.effect,
            id=edge.id,
            propagation_min_s=edge.propagation_min_s,
            propagation_max_s=edge.propagation_max_s,
            confidence_prior=edge.confidence_prior,
        )

    return graph


def get_graph() -> nx.DiGraph:
    global _G
    if _G is None:
        _G = _build_graph()
    return _G


def _derive_severity(alarms: list[AlarmEvent]) -> Literal['HIGH', 'MEDIUM', 'LOW']:
    if any(a.priority == 1 or a.alarm_type in ('HIHI', 'LOLO') for a in alarms):
        return 'HIGH'
    if any(a.priority == 2 for a in alarms):
        return 'MEDIUM'
    return 'LOW'


def _derive_confidence(edges_traversed: list[str]) -> float:
    graph = get_graph()
    product = 1.0
    for edge_id in edges_traversed:
        for _, _, data in graph.edges(data=True):
            if data.get('id') == edge_id:
                product *= data.get('confidence_prior', 0.5)
                break
    return round(min(product + 0.1, 1.0), 2)


def _open_downstream_windows(alarm_id: str, alarm_ts: str, situation_id: str):
    graph = get_graph()
    if alarm_id not in graph:
        return

    ts = datetime.fromisoformat(alarm_ts)

    for _, effect_node, edge_data in graph.out_edges(alarm_id, data=True):
        deadline = ts + timedelta(seconds=edge_data['propagation_max_s'])
        _windows[effect_node] = WatchWindow(
            effect_alarm_id=effect_node,
            deadline=deadline,
            situation_id=situation_id,
            edge_id=edge_data['id'],
            confidence_prior=edge_data['confidence_prior'],
        )


def _rebuild_situation(sit_id: str) -> Situation:
    sit = _situations[sit_id]
    sit.alarm_count = len(sit.alarms)
    sit.severity = _derive_severity(sit.alarms)
    sit.confidence = _derive_confidence(sit.edges_traversed)
    sit.affected_equipment = list(dict.fromkeys(a.equipment_id for a in sit.alarms))
    sit.causal_path = sit.affected_equipment
    sit.ts_updated = datetime.now(timezone.utc).isoformat()
    return sit


def _get_title_for_alarm(alarm_id: str) -> str:
    model = get_model()
    templates = model.templates.get('situations', {})
    if alarm_id in templates:
        return templates[alarm_id]['title']
    return f"Abnormal condition: {alarm_id}"


def _get_consequence(alarm_id: str) -> str:
    model = get_model()
    templates = model.templates.get('situations', {})
    if alarm_id in templates:
        return templates[alarm_id].get('projected_consequence', '')
    return 'Continued degradation if untreated.'


def process_alarm_event(event: AlarmEvent) -> list[Situation]:
    now = datetime.now(timezone.utc)

    stale = [k for k, w in _windows.items() if now > w.deadline]
    for k in stale:
        del _windows[k]

    alarm_id = event.alarm_id

    if alarm_id in _windows:
        window = _windows.pop(alarm_id)
        sit_id = window.situation_id
        sit = _situations.get(sit_id)

        if sit:
            sit.alarms.append(event)
            sit.edges_traversed.append(window.edge_id)
            _rebuild_situation(sit_id)
            _open_downstream_windows(alarm_id, event.ts, sit_id)
    else:
        sit_id = f"SIT-{uuid.uuid4().hex[:8].upper()}"
        sit = Situation(
            situation_id=sit_id,
            title=_get_title_for_alarm(alarm_id),
            severity=_derive_severity([event]),
            confidence=0.5,
            root_alarm_id=alarm_id,
            root_equipment_id=event.equipment_id,
            affected_equipment=[event.equipment_id],
            alarm_count=1,
            alarms=[event],
            edges_traversed=[],
            causal_path=[event.equipment_id],
            projected_consequence=_get_consequence(alarm_id),
            time_to_limit_min=None,
            ts_created=event.ts,
            ts_updated=event.ts,
        )
        _situations[sit_id] = sit
        _open_downstream_windows(alarm_id, event.ts, sit_id)

    return get_situations()


def process_alarm_clear(event: AlarmEvent):
    for sit_id, sit in list(_situations.items()):
        sit.alarms = [a for a in sit.alarms if a.alarm_id != event.alarm_id]
        if not sit.alarms:
            del _situations[sit_id]
        else:
            _rebuild_situation(sit_id)


def get_situations() -> list[Situation]:
    return sorted(
        list(_situations.values()),
        key=lambda s: (s.severity == 'HIGH', s.ts_created),
        reverse=True,
    )


def get_situation(sit_id: str) -> Optional[Situation]:
    return _situations.get(sit_id)


def reset_state() -> None:
    """Clear in-memory DAG state (for tests)."""
    global _G
    _G = None
    _windows.clear()
    _situations.clear()