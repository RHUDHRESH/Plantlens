# legacy/ — frozen reference implementations

## `cliffords-ts/` — the original `@plantlens/cliffords` ingestion engine

This is the codebase PlantLens started as: a strict TypeScript ingestion core (adapters, 3
validation gates, normalizers, parsers, mapping, immutable stores, a SHA-256 audit hash-chain,
and a model compiler) plus a static web intake console.

**Status: FROZEN.** Do not develop it further. Per `deep-research-report (2).md`, it has two jobs:

1. **Regression oracle.** Its fixtures (`cliffords-ts/src/cliffords/fixtures/`) and gate outputs
   are golden tests. The Python port in `apps/api/app/ingest/` must reproduce the same canonical
   records and gate verdicts for the same inputs. CI runs both and diffs (the `golden` test tier).

2. **Contract source.** Its contracts encode hard-won industrial semantics — port these concepts
   verbatim (don't redesign them):
   - `contracts/canonical.ts` → the canonical alarm/event + causal-edge-candidate shapes. These
     informed `packages/contracts/situation.schema.json` and `tag_frame.schema.json`.
   - `contracts/validation.ts` → Gate summaries, ingestion reports, and the **audit hash-chain**
     (`previous_event_hash` / `event_hash` / SHA-256). This is the model for
     `apps/api/app/services/audit_chain.py`.
   - The 3 gates (`gates/gate1ArtifactIntegrity`, `gate2CanonicalSchema`, `gate3IndustrialTruth`)
     → the validation philosophy for `apps/api/app/ingest/gates/`.

### Mapping: where each piece goes in the Python port
| Cliffords (TS) | Python port (apps/api/app/ingest/) | Notes |
|----------------|-------------------------------------|-------|
| `adapters/*` | `adapters/` | CSV/Excel/JSON/OPC-UA event readers → Pydantic models |
| `detectors/*` | `detectors/` | artifact-type / CSV-dialect / document-kind detection |
| `gates/gate1..3` | `gates/` | integrity → canonical schema → industrial truth, in order |
| `normalizers/*` | `normalizers/` | tag/equipment/priority/timestamp/units normalization |
| `parsers/*` | `parsers/` | cause-effect matrix, HAZOP, operator note, P&ID text |
| `mapping/*` | `mapping/` | tag/equipment/zone/archetype resolution + similarity |
| `stores/*` | `db/repositories/` + `services/audit_chain.py` | immutable raw + audit chain |
| `model/compileModel.ts` | `studio/compiler.py` | the backend now owns compile/validate/hash/version |

### How to run the oracle (to compare against your Python port)
```bash
cd legacy/cliffords-ts
pnpm install
pnpm test        # vitest — the golden gate tests
pnpm web         # the original static intake console (reference UX only)
```

### Do NOT
- Run a split-brain product (half Node, half Python). The production backend is Python.
- Import from `legacy/` into `apps/`. It is a reference, not a dependency.
- "Improve" it. If you find a bug, note it and fix the equivalent in the Python port.
