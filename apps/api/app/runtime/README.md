# apps/api/app/runtime — the deterministic cognition core (the differentiator)

This is the product's brain. Everything here is **deterministic and read-only** (rule R2): same
inputs → same outputs, no ML, no graph mutation, no hardware writes. If you get this folder right,
PlantLens works. If you make it "clever," it becomes an unauditable liability.

## The tick (call order on every TagFrame)
```
update runtime_state.tags[tag_id]
  → evaluate_alarms(state)                 # alarm_engine.py
  → diagnose / evaluate_situations(...)    # dag_runtime.py + situation_engine.py
  → build_calm_card(situation, ...)        # calm_card_engine.py   (only if a situation exists)
  → derive_asset_status(...)               # asset_status.py
  → update_projection(...)                 # projection.py         (optional, advisory)
  → audit_chain.append(decision)           # services/audit_chain.py
  → websocket_hub.broadcast(snapshot)      # websocket_hub.py
```

## Files
| File | Responsibility | Algorithm / notes | Chunk |
|------|----------------|-------------------|-------|
| `runtime_state.py` | the in-memory live state singleton (tags, active alarms/situations, latest card) | dict-backed; `snapshot()` serializes for WS | 2 |
| `websocket_hub.py` | fan-out hub: connect/disconnect/broadcast to subscribed clients | list of WebSockets; drop dead clients | 2 |
| `alarm_engine.py` | evaluate alarm_rules against live tags | thresholds + `for_ms` debounce + deadband hysteresis + latching + ack state | 3 |
| `dag_runtime.py` | root-cause traversal over the approved causal graph | reverse BFS/priority walk, temporal lag window, fingerprint scoring — **O(V+E)** | 3 |
| `situation_engine.py` | group alarms into ONE Situation (root, affected, path, evidence) | uses dag_runtime ranking; orders evidence by time | 3 |
| `calm_card_engine.py` | build the structured Calm Card from a Situation | first signal, evidence chain, why, best check, blocked actions | 3 |
| `asset_status.py` | derive per-asset status for the map | normal/warning/critical/sensor_bad/offline from alarms + quality + situation | 3 |
| `projection.py` | Time-to-Consequence (Endsley L3) | linear `τ=(L−x)/ẋ` baseline; Kalman upgrade → confidence band; **advisory only** | 3 (opt) |
| `config_loader.py` | load the compiled bundle + alarm/graph/action indexes into runtime | reads `compiled/` written by the studio compiler | 3 |

## Hard rules for this folder
- Only traverse causal edges with `approved == true`, within their `lag_ms` window.
- Non-GOOD tag quality must never produce a confident root cause — it routes to `sensor_bad`.
- Nothing here imports the gateway, the agents, or an LLM. Inputs are TagFrames + the compiled
  bundle; outputs are derived state + audit records + WS frames.
- Replace the hardcoded demo logic (in the first pass) with config-driven evaluation from
  `alarm_rules.json` / `causal_graph.json` once the slice works. Hardcode first, generalize second.
