"""tool: fetch_logs — pass-through audit ledger entries (never fabricated)."""
from __future__ import annotations


async def fetch_logs(since: float = 0.0, base_url: str = "http://localhost:8000") -> dict:
    import urllib.request, json
    with urllib.request.urlopen(f"{base_url}/api/tools/logs?since={since}") as r:
        return json.loads(r.read())
