"""tool: query_state — read current plant state (signal values + situations)."""
from __future__ import annotations


async def query_state(base_url: str = "http://localhost:8000") -> dict:
    import urllib.request, json
    with urllib.request.urlopen(f"{base_url}/api/tools/state") as r:
        return json.loads(r.read())
