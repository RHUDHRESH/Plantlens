"""P&ID digitization CNN (Domain S). Offline only; loads frozen scikit-learn artifact.

Law #3: only evaluates frozen artifacts; .fit() never runs live.
"""
from __future__ import annotations


def digitize(pid_image_path: str) -> dict:
    """Scaffold: returns detected symbols + proposed connections (engineer-gated)."""
    return {"symbols": [], "connections": [], "status": "proposal"}
