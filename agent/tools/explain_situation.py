"""tool: explain_situation — narrate the evidence path (never diagnose)."""
from __future__ import annotations


async def explain_situation(situation_id: str, base_url: str = "http://localhost:8000") -> dict:
    import urllib.request, json
    with urllib.request.urlopen(f"{base_url}/api/tools/explain?situation_id={situation_id}") as r:
        return json.loads(r.read())
