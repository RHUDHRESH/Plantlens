# apps/api/tests — the test pyramid

| Tier | Folder | What it covers |
|------|--------|----------------|
| unit | `unit/` | validators, alarm thresholds/debounce/deadband, DAG traversal, calm-card builder, audit hash |
| integration | `integration/` | API routes + DB + WS (httpx ASGI client), compile pipeline end-to-end |
| contract | `contract/` | sample bundle validates vs schemas; Pydantic `model_json_schema()` == canonical schema |
| golden | `golden/` | Python ingest port output == legacy/cliffords-ts oracle output for shared fixtures |
| scenario | `scenario/` | run each scenarios.json scenario, assert expected_root_cause + expected_alarms |

## The two tests that prove the product
1. `scenario/test_motor_overload.py` — run `scn_motor_overload`; assert exactly ONE situation,
   `root_asset_id == "MTR-301"`, evidence order current→speed→bus→inverter.
2. `unit/test_audit_chain.py` — append N records, verify chain passes; tamper one, verify it's
   detected at the right index.

## Tooling
`pytest` + `pytest-asyncio`; `httpx.ASGITransport` for the in-process client. Run: `uv run pytest`.
