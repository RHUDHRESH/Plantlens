# Contract and Authored-Source Audit

Audit date: 2026-06-22

## Canonical contracts

- `packages/contracts/*.schema.json` — **unchanged** in this gate
- `pnpm contracts:validate` — **PASS** for demo-microgrid bundle

## Source-of-truth rules verified

| Rule | Status |
|---|---|
| Authored contracts canonical | Yes — plant, tag_map, alarm_rules, causal_graph |
| Compiled HMI not hand-edited in repo workflow | Yes — compiler output consumed via API |
| Runtime indexes not treated as authored source | Yes — runtime store is projection only |
| Studio demo data documented as frontend copy | Yes — see drift check below |

## Studio `demo-data` drift check

Copied into `apps/web/src/features/studio-forms/demo-data/` for Vite JSON imports.

| File | Canonical hash (sha256 prefix) | Copy hash | Drift |
|---|---|---|---|
| `plant.json` | `367a872cab92` | `367a872cab92` | **None** |
| `tag_map.json` | `480f267c27fb` | `480f267c27fb` | **None** |
| `alarm_rules.json` | `c9e587b61773` | `c9e587b61773` | **None** |
| `causal_graph.json` | `bf636e3331a1` | `bf636e3331a1` | **None** |
| `action_envelope.json` | N/A (canonical is YAML) | frontend JSON from sample YAML | **Documented** — intentional frontend copy; not a BLOCKER |

No silent drift on the four JSON mirrors of canonical sample data.