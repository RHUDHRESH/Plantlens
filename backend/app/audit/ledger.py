"""Hash-chained audit ledger (Domain T).

entry.hash = sha256(prev_hash + canonical(body))
canonical() MUST be byte-stable across machines:
  json.dumps(obj, sort_keys=True, separators=(',', ':'))
Append-only, tamper-evident. Every acknowledge / mark-as / agent conversation
is written here. Operator feedback routes to the DAG review queue.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from threading import Lock


def canonical(body: dict) -> str:
    """Deterministic JSON for byte-stable hashing across machines."""
    return json.dumps(body, sort_keys=True, separators=(",", ":"))


@dataclass
class LedgerEntry:
    ts: float
    kind: str  # "ack" | "mark_as" | "situation" | "agent" | "state_change"
    actor: str
    body: dict
    prev_hash: str = ""
    hash: str = field(default="", init=False)

    def __post_init__(self) -> None:
        payload = self.prev_hash + canonical(self.body)
        self.hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()


class AuditLedger:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path
        self._lock = Lock()
        self._entries: list[LedgerEntry] = []
        self._head = "0" * 64  # genesis

    @property
    def head(self) -> str:
        return self._head

    def append(self, kind: str, actor: str, body: dict) -> LedgerEntry:
        with self._lock:
            entry = LedgerEntry(ts=__import__("time").time(), kind=kind, actor=actor,
                                body=body, prev_hash=self._head)
            self._entries.append(entry)
            self._head = entry.hash
            return entry

    def verify(self) -> bool:
        prev = "0" * 64
        for e in self._entries:
            payload = prev + canonical(e.body)
            if hashlib.sha256(payload.encode("utf-8")).hexdigest() != e.hash:
                return False
            prev = e.hash
        return True

    def entries(self) -> list[LedgerEntry]:
        return list(self._entries)
