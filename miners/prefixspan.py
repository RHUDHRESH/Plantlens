"""PrefixSpan sequential pattern mining (Domain S). Offline only."""
from __future__ import annotations


def mine(sequences: list[list[str]], min_support: float = 0.2) -> list[dict]:
    return [{"pattern": s, "support": 0.0, "status": "proposal"} for s in sequences]
