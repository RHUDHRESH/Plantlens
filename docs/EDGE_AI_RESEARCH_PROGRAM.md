# PlantLens Edge AI Research Program

Status: research shadow only; never authoritative in the live runtime.

## Research thesis

The publishable contribution is not another closed-set bearing classifier. PlantLens will
test whether a bounded, physics-informed factorial temporal model can improve compound-fault
diagnosis, unknown-fault rejection, and calibration under operating-mode shift while meeting
hard edge resource limits and producing replayable evidence envelopes.

Working name: **PI-BFAST** - Physics-Informed Bounded Factorial Abductive State Tracker.

## Literature position

- Physics-informed multimodal CNN work combines vibration, motor current, bearing-frequency
  constraints, and transfer learning, supporting the value of mechanism-aware multimodal
  evidence while remaining largely a closed classifier
  ([Alam et al., 2025](https://arxiv.org/abs/2508.07536)).
- Physics-informed graph learning has recently targeted open-set domain generalization and
  uncertainty propagation, making open-set shift a necessary comparison rather than a novelty
  claim by itself ([Zhu et al., 2026](https://arxiv.org/abs/2607.04188)).
- Comparative uncertainty experiments find deep ensembles strong for epistemic and aleatoric
  uncertainty, so a compact ensemble is a required baseline
  ([Jalayer et al., 2024](https://arxiv.org/abs/2412.18980)).
- Switched dynamic Bayesian networks provide established machinery for discrete mode changes,
  continuous evolution, residual uncertainty, and fault isolation
  ([Zhou et al., 2015](https://doi.org/10.36001/phmconf.2015.v7i1.2602)).
- Adaptive conformal inference addresses online distribution shift, while non-exchangeable
  split conformal theory makes clear that serial data needs explicit coverage analysis
  ([Gibbs and Candes, 2024](https://www.jmlr.org/papers/v25/22-1218.html);
  [Oliveira et al., 2024](https://jmlr.org/papers/v25/23-1553.html)).
- Bayesian online changepoint detection remains a strong, cheaper degradation baseline rather
  than a substitute for compound diagnosis
  ([Altamirano et al., 2023](https://proceedings.mlr.press/v202/altamirano23a.html)).
- Edge benchmarking must report initialization, warm/steady inference, and memory, not a single
  average latency number; TensorFlow Lite's benchmark methodology provides an established
  measurement template
  ([TensorFlow Lite measurement guide](https://github.com/tensorflow/tensorflow/blob/master/tensorflow/lite/g3doc/performance/measurement.md)).

## Proposed contribution

PI-BFAST combines six elements as one auditable edge evidence compiler:

1. Mode-conditioned physics features and cross-sensor residuals.
2. Quality-weighted, per-fault likelihood evidence; bad sensors reduce evidence rather than
   silently becoming zeros.
3. Factorial fault bits, allowing compound states instead of one softmax label.
4. Bounded top-K temporal expansion with deterministic ordering and explicit transition priors.
5. Robust healthy-density novelty plus adaptive conformal rejection under mode/site shift.
6. Versioned evidence envelopes with bit-stable replay and measured latency/RAM/energy.

The current `factorial_shadow.py` implements the bounded temporal kernel, robust novelty score,
quality weighting, contradictions, compound states, and explicit rejection. Its explainability
receipt exposes ranked feature contributions, quality multipliers, contradictions, state
transitions, causal-path edges, and graph compatibility for every top candidate. Unapproved,
unknown, self-referential, and cyclic fault edges fail at construction. It is intentionally not
imported by the production runtime.

`compact_ensemble.py` adds a five-member, resource-bounded ensemble baseline for overload,
imbalance, bearing wear, thermal stress, and sensor faults. It reports the member mean,
epistemic disagreement, quality-weighted contributors, and novelty/quality abstention. Its
coefficients are explicitly expert-seeded and inference-only until a locked run-level training
corpus exists; they must not be described as a trained production model.

## UNO Q benchmark evidence

On 23-Aug-2026, the five-member compact ensemble plus the PI-BFAST temporal kernel was executed
inside the PlantLens container on the connected UNO Q for 200 synthetic motor-overload epochs:

- median fused latency: 11.6338 ms
- p95 fused latency: 11.9572 ms
- maximum fused latency: 35.4903 ms
- Python `tracemalloc` peak: 274.34 KiB
- ensemble and temporal decision: `KNOWN_FAULT`, top state `overload`
- replay SHA-256: `2234378f626afb18e2395710b1c45f3a791aa39d963a3de007ad303534afa4a9`

This is a compute-path benchmark, not an accuracy result and not an end-to-end sensor latency
claim. The same receipt hash was produced on the Windows development host. Accuracy, calibration,
energy, and live sensor-to-decision latency remain open until the commissioning map and locked
corpus exist.

## Edge architecture

```text
Easy302 / high-rate sensor sidecar
        |
        v
read-only acquisition -> timestamp/skew gate -> ring buffers
        |
        +-> deterministic safety/status path (unchanged authority)
        |
        v
mode state -> physics DSP -> quality-weighted evidence models
        |                         |
        |                         +-> diagonal Student-t novelty
        v
bounded factorial beam (K=16/32, <=10 fault bits, <=3 simultaneous)
        |
        v
adaptive conformal/abstention -> shadow evidence envelope -> replay store
        |
        +-> comparison only; cannot alarm, write PLC, or mutate approved DAG
```

## Falsifiable hypotheses

- H1: Factorial temporal fusion improves compound-fault macro F1 over independent trees and a
  multiclass network without increasing healthy false episodes.
- H2: Mode conditioning reduces startup/transient false episodes by at least 30% relative to a
  global baseline.
- H3: Novelty plus adaptive conformal gating routes at least 90% of withheld fault classes or
  unsupported modes to UNKNOWN/HUMAN_REVIEW.
- H4: Quality weighting detects injected sensor faults before issuing a machine-fault label in at
  least 95% of trials.
- H5: K=16 retains statistically equivalent decisions to K=32 on the locked corpus while reducing
  p95 latency and peak allocation.
- H6: The complete fused update remains below 250 ms p95 and 300 MB RSS on UNO Q, with the temporal
  kernel below 25 ms p95.

These are preregistered targets, not achieved results.

## Required data

The PLC's 21 summarized registers are sufficient for acquisition quality, low-rate mode/state,
thermal/electrical residuals, and pipeline experiments. They are not sufficient for bearing-order,
envelope, MCSA-sideband, or transient waveform claims.

Add a synchronized high-rate sidecar for research:

- Triaxial acceleration: 6.4 or 12.8 kHz after anti-alias verification.
- Three-phase current and voltage: 4-8 kHz synchronized.
- Tach pulse or encoder timing for order tracking and slip.
- Temperature at 1-10 Hz and optional airflow/pressure at 10-100 Hz.
- A monotonic common epoch with measured maximum channel skew.

## Experimental protocol

Split by physical run, machine, load, speed, and date - never random windows. Lock a golden test
corpus before tuning. Withhold at least one fault class and one operating regime. Inject dropout,
stuck, bias, clipping, time skew, and swapped mappings separately from machine faults.

Baselines:

- CUSUM/BOCD plus approved rules.
- Calibrated shallow boosted trees, independent per fault.
- Compact 1D CNN or TCN, INT8 when supported.
- Deep ensemble or MC-dropout uncertainty baseline.
- Static Bayesian network and HMM/switching model.
- PI-BFAST without each component in turn.

Report macro/micro F1 by fault and compound state, AUROC/AUPR for unknown detection, Brier/ECE,
risk-coverage, mode/site coverage, healthy false episodes per asset-hour, detection delay, sensor
fault precedence, replay parity, initialization/warm/steady latency, CPU utilization, peak RSS,
model bytes, storage bandwidth, and energy per fused update when measurement hardware is available.

## Ablations

Remove mode conditioning, physics features, contradiction evidence, quality weights, temporal
transitions, factorial states, novelty, conformal gating, and graph compatibility one at a time.
Repeat with K=4/8/16/32, FP32/FP16/INT8 evidence models, one/two/four CPU threads, and every sensor
family masked. Publish negative results.

## Safety and product boundary

PI-BFAST is a shadow research channel. PlantLens's approved deterministic DAG remains the live root
cause authority. Shadow outputs cannot create alarms, suppress deterministic safety events, write
Modbus registers/coils, approve graph edges, or change rules. Promotion requires a separate human
design review and contract change after the preregistered evidence is complete.
