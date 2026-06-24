"""Smoke test: a simulator tick produces valid CanonicalValues and the
orchestrator runs end-to-end on fake data (Stage 1 benchmark).

Run: uv run python -m app.tests.test_pipeline
"""
from __future__ import annotations

import asyncio

from ..pipeline.orchestrator import get_orchestrator
from ..schemas.canonical import CanonicalValue


async def main() -> None:
    orch = get_orchestrator()
    res = await orch.tick()
    for v in res.values:
        assert isinstance(v, CanonicalValue), f"bad canonical type: {type(v)}"
        print(f"  canonical: {v.instance_id}.{v.signal_key} = {v.value} q={v.quality}")
    print(f"tick ts={res.ts:.1f} degraded={res.degraded} "
          f"values={len(res.values)} situations={len(res.situations)}")
    print("OK: orchestrator ran end-to-end")


if __name__ == "__main__":
    asyncio.run(main())
