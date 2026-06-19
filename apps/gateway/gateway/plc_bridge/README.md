# apps/gateway/gateway/plc_bridge — DAG-to-PLC advisory bridge (Chunk 12)

**The hard rule: the DAG does not control the PLC. The PLC controls the machine.** PlantLens
publishes its diagnosis to PLC registers as ADVISORY state, and any action becomes a REQUEST the
PLC accepts/denies via its own interlocks. PlantLens never directly trips or actuates.

The clean line for the demo: *"PLC controls. DAG explains. Operator approves. PLC interlocks decide."*

## Three levels (ship Level 1, demo Level 2, prototype Level 3)
1. **Read-only** (MVP) — PLC → PlantLens only. No writes.
2. **Advisory writeback** (demo) — write SITUATION_CODE/ROOT_ASSET_CODE/SEVERITY/CONFIDENCE to
   holding registers so the PLC/HMI can display PlantLens's diagnosis. Safe; just advisory.
3. **Action-request handshake** (advanced) — PlantLens writes a REQUEST; the PLC checks interlocks
   and writes back accepted/denied. PlantLens never executes.

## Files
| File | Responsibility |
|------|----------------|
| `diagnosis_encoder.py` | Situation → numeric codes (SITUATION_CODE, ROOT_ASSET_CODE, SEVERITY, CONFIDENCE%) |
| `advisory_writer.py` | write the advisory registers (FC06/FC16) — advisory only |
| `action_request_writer.py` | write an action-request block; set REQUEST_ACTIVE last (avoid half-read) |
| `plc_feedback_reader.py` | read PLC_ACTION_STATUS / DENY_REASON / LAST_ACTION_ID back |
| `bridge_service.py` | orchestrate: on new Situation, encode + write advisory (≤ every 2s; clear when cleared) |
| `plc_output_map.json` | register addresses + meanings for the advisory + request/feedback blocks |

## Code tables (keep small + documented in plc_output_map.json)
SITUATION_CODE: 0 none, 101 MOTOR_MECHANICAL_OVERLOAD, 102 INVERTER_UNDERVOLTAGE, 103 DC_BUS_SAG,
104 RPM_SENSOR_FAULT, 105 MOTOR_OVERTEMP. ASSET_CODE: 0 none, 1 BUS-101, 2 INV-102, 3 MTR-301...
SEVERITY: 0 normal,1 info,2 warning,3 critical. PLC_ACTION_STATUS: 0 none,1 received,2 accepted,
3 denied,4 executing,5 completed,6 failed.

## Red-team answers (for Q&A)
- "Can the DAG stop the motor?" No. MVP is advisory; even Level 3 only writes a request the PLC
  may deny via its interlocks.
- "What if the diagnosis is wrong?" Raw alarms + DAG path stay visible; PLC logic doesn't depend on
  the DAG; operator approval + PLC interlocks gate any action.
- "Comms fail mid-request?" Requests carry a TTL; the PLC rejects stale requests; existing PLC
  logic runs independently.
- "Bad values written?" The PLC validates action code/target/TTL/interlocks; unknown codes denied.

## Cadence
Write advisory only when the Situation CHANGES, and at most every ~2s. Clear the advisory block
when no Situation is active. Don't spam the bus at the tick rate.
