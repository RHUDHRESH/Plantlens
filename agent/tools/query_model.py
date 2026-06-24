"""tool: query_model — read canonical model files (asset_types, plant, graph, ...)."""
from __future__ import annotations


async def query_model(name: str, base_url: str = "http://localhost:8000") -> dict:
    import urllib.request, json
    with urllib.request.urlopen(f"{base_url}/api/models/{name}") as r:
        return json.loads(r.read())
