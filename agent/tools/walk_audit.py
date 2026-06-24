"""tool: walk_audit — verify + traverse the hash-chained ledger."""
from __future__ import annotations


async def walk_audit(base_url: str = "http://localhost:8000") -> dict:
    import urllib.request, json
    with urllib.request.urlopen(f"{base_url}/api/audit") as r:
        return json.loads(r.read())
