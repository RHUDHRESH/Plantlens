# State of Charge Audit

Audit date: 2026-06-22  
Plant: `packages/sample-data/demo-microgrid`

## Findings

| Question | Answer |
|---|---|
| 1. Direct SOC tag? | **No** — `tag_map.json` has no `SOC`, `BAT_SOC`, `BMS_SOC`, or semantic `state_of_charge` tag. |
| 2. Battery asset? | **Yes** — `BAT-101` (`storage.battery`, LiFePO4 in `meta.chemistry`). |
| 3. Battery current tag? | **No** — no `BAT_101_I` or battery current entry in demo tag map. |
| 4. Battery voltage tag? | **Yes** — `BAT_101_V` (`electrical.voltage.dc`, unit V). |
| 5. Capacity Ah anywhere? | **No** — plant meta has `nominal_voltage_v` only, no `capacity_Ah`. |
| 6. Initial SOC anywhere? | **No** |
| 7. OCV lookup table? | **No** |
| 8. Chemistry field? | **Yes** — `LiFePO4` on `BAT-101` meta (insufficient alone for voltage-only SoC). |
| 9. Enough for direct SOC? | **No** |
| 10. Enough for coulomb-counted SOC? | **No** — missing current tag, capacity, initial SOC, sign convention, and sample history. |
| 11. Enough for OCV-corrected SOC? | **No** — missing OCV table and rest/OCV-valid flag. |

## Component library note

`packages/sample-data/component-library/standard_components.json` defines a `battery_soc` signal template for generic library components. That is **not** wired into the demo-microgrid authored `tag_map.json` or simulator tags.

## Final SOC verdict

**SOC_NOT_AVAILABLE**

Correct UI behavior: show *"SOC unavailable — missing required authored inputs."*  
Do **not** infer SoC from `BAT_101_V` alone (LiFePO4 flat OCV curve).

## Implementation on this branch

- `apps/web/src/features/battery-soc/socEstimator.ts` — honest resolver (direct / coulomb / OCV gates)
- `SocBadge` in `AssetDetailDrawer` for battery assets — unavailable state for demo plant