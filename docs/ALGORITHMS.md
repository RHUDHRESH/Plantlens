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

## 3. Root-cause diagnosis (causal engine v2)

`apps/api/app/runtime/dag_runtime.py` (public API) → `apps/api/app/runtime/causal/`

**Structure** (`causal/structure.py`). This is compiled once per approved-edge set and cached;
the runtime only reads it.

- Only approved edges are used.
- Strongly-connected components are found with Tarjan's algorithm, so engineer-flagged feedback
  loops are condensed into a single unit.
- For every root there are two windows:
  - the fastest arrival at each downstream node (Dijkstra on `lag_ms[0]`), plus the path used
    to explain it;
  - a conservative slowest arrival: the sum of `lag_ms[1]` over the condensation, plus one
    dwell through each loop on the way.
- Edge `polarity` is multiplied along the fastest path.

**Scoring** (`causal/engine.py`). Every alarmed node, and every approved ancestor of one, is a
candidate r. Each candidate gets five terms:

| Term | Meaning |
|------|---------|
| T timing | The share of explained alarms whose onset is not before r's first onset (first-out). An unobserved r is anchored at the latest instant consistent with its downstream symptoms. |
| C coverage | Explained alarms divided by alarms in scope. A downstream alarm is explained only if its onset falls inside r's accumulated window. `expected_symptoms` that are still missing once the window has elapsed also count against C. |
| F fingerprint | The authored evidence: `evidence_tags`, `root_cause_rules`, `fingerprint_rules` and `score_adjustments`. It is floored at 0.5 when r has its own alarm. |
| Q quality | The share of r's evidence tags that are STALE, BAD or MISSING. |
| K contradictions | Downstream alarms that began before r (beyond the tolerance), or that moved against the edge polarity. |

`score = prior · T^w_t · C^w_c · F^w_f · (1−Q)^w_q · contradiction_factor^K`

The weights and tolerances come from `causal_graph.scoring` (defaults in code). An unobserved
root is also multiplied by `unobserved_prior`.

**Root selection** is greedy, so the smallest set of roots explains the flood (up to
`max_roots`). Independent faults therefore produce independent situations.

**Calibration.** Each root's score is discounted by its margin over the best competitor that
explains overlapping alarms (`causal/confidence.py`). A perfect but ambiguous root reads
"medium". This bucket function is the only one; the DAG, situation and Calm Card code all use it.

**Explanations.** Every candidate carries its explained, unexplained and contradicting alarms and
its traversed edges. A root inside a loop gets "loop entered at X". Trace ids are a hash of the
graph and the alarm onsets, so a replay is reproducible.

No ML. No LLM. No graph mutation.

## 4. Situation grouping

`apps/api/app/runtime/situation_engine.py`

One situation per selected root, grouping only the alarms that root explains. Matches
`causal_graph.situation_types` by:

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

- no cycles in approved edges, **except** engineer-flagged feedback loops: a cycle is accepted
  only if every edge in it has `loop_ok: true`; accepted loops are reported in
  `GraphCompileResult.feedback_loops`
- known assets/tags/alarms
- unapproved edges excluded from runtime index

## Replay / testing

`apps/api/tests/test_scenarios_regression.py` runs full pipeline per scenario without hardware or agents.