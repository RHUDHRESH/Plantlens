"""Agent transcript logger — the agent's own conversations are audited (Domain Q).

What was asked, what it read, what it said -> appended to the audit ledger so an
unaudited assistant in a safety context is not itself a hole.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, asdict
from pathlib import Path

LOG = Path(__file__).resolve().parent / "transcripts.jsonl"


@dataclass
class Turn:
    ts: float
    role: str  # user | assistant | tool
    content: str
    citations: list[dict]


def log_turn(turn: Turn) -> None:
    with LOG.open("a", encoding="utf-8") as f:
        f.write(f"{asdict(turn)}\n")
