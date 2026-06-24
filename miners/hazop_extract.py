"""HAZOP semantic edge extraction (Domain S). Offline only.

Weakest link in the mining chain — lean on the engineer approval gate hardest here.
"""
from __future__ import annotations


def extract(hazop_text: str) -> list[dict]:
    """Scaffold: parse HAZOP deviations into edge candidates."""
    return [{"cause": "", "effect": "", "status": "proposal"}]
