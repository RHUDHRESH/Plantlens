# PlantLens Demo Scenario — the bench you build everything against

One bench, one hero scenario, repeatable to the second. Everything in `packages/sample-data/
demo-microgrid/` describes this bench. Build against it; demo from it.

## The bench: DC microgrid (seven waypoints)

```
PV-101 ──▶ MPPT-101 ──▶ BAT-101 ──▶ BUS-101 ──┬─▶ INV-101 ──▶ LD-201  (lamp load)
 (solar)   (charge ctl) (battery)   (DC bus)   └─▶ INV-102 ──▶ MTR-301 (3-phase motor)
```

Why electrical/microgrid instead of a generic process loop: it aligns with ABB electrical
distribution, gives clean structural causal edges (power flows downstream), and makes the
"effect looks like a cause" trap vivid (a bus sag downstream *looks* like the problem but is
caused upstream by the motor pulling current).

## Hero scenario — "Motor Mechanical Overload" (`scn_motor_overload`)

Timeline (the simulator plays this from `scenarios.json`):
```
 0.0s  baseline: motor current 1.2A, RPM 1450, bus 48V, motor temp 48°C
 2.0s  motor current rises → 3.4A      (MECHANICAL load increasing — the true root)
 4.0s  motor RPM drops → 760 rpm        (effect of the load)
 6.0s  DC bus voltage sags → 40.5V      (effect: motor branch pulling the bus down)
 7.5s  inverter undervoltage = true     (effect: downstream of the bus sag)
10.0s  motor temp rises → 78°C          (consequence)
```

Raw alarms that fire (the flood):
```
MOTOR_CURRENT_HIGH · MOTOR_SPEED_LOW · DC_BUS_LOW · INV_UNDERVOLTAGE · MOTOR_TEMP_HIGH
```

What PlantLens does with the flood:
- **Situation engine** groups them into ONE `MOTOR_MECHANICAL_OVERLOAD`, root = `MTR-301`,
  affected = `[BUS-101, INV-102]`, causal path = `[MTR-301 → BUS-101 → INV-102]`.
- **Calm Card** shows: first signal = "motor current rose first (10:32:14)"; evidence chain
  ordered current→speed→bus→inverter; why = "the motor branch is pulling the bus down; the
  source is not the first suspect"; best first check = "inspect shaft load, coupling, bearing
  drag (requires isolation)"; blocked action = "restart inverter — blocked while motor thermal
  unresolved".
- **2D/3D map**: motor red, bus + inverter amber, causal path numbered 1-2-3.
- **Time-to-Consequence** (if built): "motor temp → HH trip in 4:10 and counting".

The demo win, stated brutally: *can a judge watch 5 alarms collapse into 1 evidence-backed Calm
Card that correctly fingers the motor, not the bus?* If yes, the product works.

## Scenario matrix (automated regression in `apps/api/tests/test_scenarios_regression.py`)

| id | name | proves |
|----|------|--------|
| `scn_motor_overload` | Motor mechanical overload | 5 alarms → 1 situation; root `MTR-301` |
| `scn_pv_generation_loss` | PV generation loss | upstream root `PV-101`, not the bus |
| `scn_sensor_stale_no_root` | Stale sensor only | `sensor_bad`; no confident root cause |
| `scn_unapproved_edge_ignored` | False edge temptation | unapproved PV→motor edge ignored |
| `scn_gateway_dropout` | Gateway dropout | STALE/MISSING tags; no process root cause |
| `scn_recovery_clear` | Recovery clear | situation clears; `DC_BUS_LOW` latched pending ack |
| `scn_downstream_only_no_root` | Downstream-only alarms | bus + inverter alarms; no confident process root |
| `scn_temporal_violation_rejected` | Temporal violation | motor cause after bus effect; candidate rejected |

Launch from the Runtime HMI **Scenarios** toolbar or `POST /api/scenarios/{id}/start`.

## The "before / after" that sells it
- **Before:** 12 alarms flashing, operator confused, no idea which is the cause.
- **After:** 1 Calm Card, root cause + evidence + safe first action, raw alarms one click away.

## Demo safety nets (build these — live demos fail)
1. **Simulator mode** (deterministic scenario) — the primary demo path.
2. **Recorded playback** — replay a captured run if the live sim hiccups.
3. **2D fallback** — if WebGL dies on the venue machine, 2D still works.
Rehearse to the second; carry a recorded video fallback.

## Standards talking points (credibility currency for Q&A)
- Alarm flood = >10 alarms / 10 min / operator (ISA-18.2 / IEC 62682); target <1% of time in flood.
- Grouping = suppression-*by-design* with full traceability, not hiding (OPC-UA Part 9 audit).
- Countdown = Endsley Level-3 projection (the capability Buncefield operators lacked).
- Causal seed = IEC 61511 cause-&-effect matrix used as a *structural seed*, never replacing SIS.
- Honesty: hash-chain is tamper-*evident* not tamper-*proof*; linear extrapolation is a decision
  aid, never an interlock; the bench is not "certified" — state the standards path, don't claim it.
