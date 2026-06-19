# apps/api/app/ingest — Python port of the Cliffords ingestion pipeline

This ports `legacy/cliffords-ts` into the Python backend so PlantLens has ONE language. Same
contracts, same 3 gates, same audit hash-chain — reimplemented with Pydantic. The legacy TS engine
stays frozen as the regression oracle; this must reproduce its outputs (the `golden` test tier).

> Build this AFTER the live runtime slice (Chunks 0-6). Ingestion is how authored knowledge
> (alarm histories, cause-effect matrices, HAZOP, operator notes) becomes draft contracts; it is
> not on the live tick. Prioritize the live demo first.

## Structure (mirror the legacy layout — see legacy/README.md mapping table)
| Folder | From legacy | Purpose |
|--------|-------------|---------|
| `adapters/` | adapters/ | CSV/Excel/JSON/OPC-UA event readers → raw artifacts |
| `detectors/` | detectors/ | artifact-type, CSV-dialect, document-kind detection |
| `gates/` | gates/gate1..3 | gate1 integrity → gate2 canonical schema → gate3 industrial truth |
| `normalizers/` | normalizers/ | tag/equipment/priority/timestamp/units/quality normalization |
| `parsers/` | parsers/ | cause-effect matrix, HAZOP, operator note, P&ID text, permit |
| `mapping/` | mapping/ | tag/equipment/zone/archetype resolution + similarity |
| `pipeline.py` | runtime.ts | the runCliffordsCycle equivalent: detect → adapt → gate → normalize → quarantine → report |

## What it produces
Draft canonical records (alarm events, **causal-edge candidates**) that feed the OFFLINE authoring
path: a human reviews/approves them in Studio before they enter the approved causal graph (R2/R5).
Nothing from ingestion enters the live runtime un-approved.

## Golden parity
`tests/golden/` feeds the legacy fixtures through both engines and asserts identical canonical
output + gate verdicts. If they diverge, either the port has a bug or you found a legacy bug — fix
the Python side and note the legacy discrepancy.
