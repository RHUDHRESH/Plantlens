# apps/api/app/services — cross-cutting services

| File | Responsibility | Chunk |
|------|----------------|-------|
| `audit_chain.py` | append-only, hash-chained audit ledger ("receipts") | 1 |
| `export_service.py` | export an incident / audit feed / compiled bundle (PDF/JSON) | 13 |

The audit chain is load-bearing for X-Factor 2 ("glass-box suppression with receipts") and rule
R6. It is the Python port of the proven hash-chain in `legacy/cliffords-ts` (validation.ts).
