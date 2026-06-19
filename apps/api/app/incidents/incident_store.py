"""In-memory incident store — append-only timeline."""

from __future__ import annotations

from copy import deepcopy
from threading import Lock
from typing import Any


class IncidentStore:
    def __init__(self) -> None:
        self._incidents: dict[str, dict[str, Any]] = {}
        self._lock = Lock()

    def save(self, incident: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            stored = deepcopy(incident)
            self._incidents[stored["incident_id"]] = stored
            return deepcopy(stored)

    def get(self, incident_id: str) -> dict[str, Any] | None:
        with self._lock:
            incident = self._incidents.get(incident_id)
            return deepcopy(incident) if incident else None

    def list_ids(self) -> list[str]:
        with self._lock:
            return list(self._incidents.keys())

    def append_timeline(self, incident_id: str, item: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            incident = self._incidents.get(incident_id)
            if incident is None:
                msg = f"incident {incident_id} not found"
                raise KeyError(msg)
            incident["timeline"] = [*incident.get("timeline", []), deepcopy(item)]
            return deepcopy(incident)

    def update(self, incident_id: str, **fields: Any) -> dict[str, Any]:
        with self._lock:
            incident = self._incidents.get(incident_id)
            if incident is None:
                msg = f"incident {incident_id} not found"
                raise KeyError(msg)
            for key, value in fields.items():
                incident[key] = deepcopy(value)
            return deepcopy(incident)

    def clear(self) -> None:
        with self._lock:
            self._incidents.clear()


incident_store = IncidentStore()


def reset_incident_store_for_tests() -> None:
    incident_store.clear()