# PlantLens Algorithms

> **CURRENT SOURCE OF TRUTH — safe for build agents.**

Deterministic runtime cognition pipeline. **AI does not diagnose live faults.**

## Pipeline

```
TagFrame → quality gate → alarm evaluation → DAG root-cause trace
  → situation grouping → RuntimeEvidencePacket → Calm Card → asset status → audit
```

Agents read `RuntimeEvidencePacket` only. They never recompute root cause.

## 0. Runtime clock and evaluation cadence

`apps/api/app/runtime/runtime_tick.py`, `ticker.py`

- **Evaluation instant.** A simulator frame is evaluated at its scenario timestamp. A gateway
  frame is evaluated at its server `ingest_ts`, so a skewed device clock can neither mark tags
  STALE nor delay alarms. `frame.timestamp` stays the device's observation time.
- **Debounce deadline catch-up.** The alarm engine records when each running `delay_ms + for_ms`
  debounce will complete. Before applying a frame, the runtime evaluates at every deadline that
  passed since the last one. An alarm therefore latches exactly at its deadline, not when the
  next unrelated frame arrives. This is deterministic under instant replay.
- **Periodic ticker.** Runs every `RUNTIME_TICK_MS` (default 100 ms; 0 disables it) on the runtime
  clock, which is the last evaluation instant plus the monotonic time elapsed since. It completes
  debounces and staleness when no frame follows. It pushes a snapshot only when operator-visible
  state changes.
- **Alarm timestamps.** `onset_at` is when the condition first became true, before any debounce.
  `raised_at` is when the alarm latched, and it stays stable while the alarm is active. Both
  feed first-out ordering.
- **Errors are never swallowed.** An evaluation failure is logged, and the frame is not counted
  as `accepted`.

## 1. Tag quality

`apps/api/app/runtime/quality.py`

Classifies each reading as `GOOD | SUSPECT | STALE | MISSING | BAD | OUT_OF_RANGE` using:

- raw gateway quality
- age vs `stale_after_ms` / `missing_after_ms`
- physical min/max
- optional rate-of-change limit

`BAD/STALE/MISSING` cannot support process root-cause claims alone.

## 2. Alarm engine

`apps/api/app/runtime/alarm_engine.py`

- Threshold comparators with deadband/hysteresis on clear
- Debounce via `delay_ms` + `for_ms`
- Latching and ack state
- Shelved alarms excluded from active process set
- Non-`GOOD` tags never raise process alarms
- Alarm records include `evidence` metadata for reconstruction

## 3. DAG root-cause

`apps/api/app/runtime/dag_runtime.py`

```
symptom alarm → reverse walk approved edges only
  → fingerprint score per node (evidence_tags, root_cause_rules)
  → temporal lag window check
  → rank candidates, reject below min_root_score
  → RootCauseTrace with rejected_candidates
```

No ML. No LLM. Constants: `DEFAULT_MIN_ROOT_SCORE`, confidence buckets in code.

## 4. Situation grouping

`apps/api/app/runtime/situation_engine.py`

Matches `causal_graph.situation_types` by:

- root asset from trace
- required alarms
- extra conditions
- min_root_score

Fail closed: stale-only evidence → no situation.

## 5. Calm Card

`apps/api/app/runtime/calm_card_engine.py`

Built from `RuntimeEvidencePacket` only:

- first signal, evidence chain, recommended check (action envelope)
- blocked actions, raw alarm count (grouped, not hidden)
- operator disclaimer

## 6. Time-to-consequence

`apps/api/app/runtime/projection.py`

Advisory EMA projection:

- states: `unknown | stable | approaching_limit | exceeded`
- `seconds_low / seconds_mid / seconds_high` band
- ignores non-GOOD samples
- never used for trip/control

## 7. Graph compile

`apps/api/app/runtime/graph_compile.py`

Validates authored graph before runtime:

- no cycles in approved edges
- known assets/tags/alarms
- unapproved edges excluded from runtime index

## Replay / testing

`apps/api/tests/test_scenarios_regression.py` runs full pipeline per scenario without hardware or agents.