# Continuous Demo Video Script

Target duration: 7-8 minutes. Record in one uninterrupted take.

## 0:00-0:25 - Date and identity

- Show the current date using a newspaper or a live Google search.
- State: "We are Volt Visionaries from Saveetha Engineering College. This is PlantLens."
- Show all four members briefly.

## 0:25-1:20 - Problem and complete rig

- Pan across the Arduino UNO Q, sensors, motor, fan, blower, protected power stage, and alert output.
- Explain that threshold systems create multiple symptoms but do not identify the first credible cause.
- Keep the UNO Q visibly central.

## 1:20-2:10 - Edge architecture

- Show the App Lab/local application.
- Explain: MCU samples and quality-checks signals; Linux side runs the local fingerprint model; PlantLens applies causal reasoning.
- Disconnect internet or state that inference is local only if this is visibly verifiable.

## 2:10-3:00 - Healthy baseline

- Start the machine in healthy condition.
- Show stable sensor traces and `HEALTHY` status.
- Point out the learned fingerprint and absence of sustained alert.

## 3:00-4:20 - Hero fault: controlled overload

- Apply the safe, repeatable load restriction.
- Show current changing before RPM falls.
- Show three-window persistence, accepted fault state, local LED/buzzer, and Calm Card.
- Read out likely root, supporting evidence, confidence, and next inspection step.

## 4:20-5:15 - Second fault

- Demonstrate imbalance or airflow blockage.
- Show that the evidence pattern differs from overload.

## 5:15-6:00 - Honest rejection

- Disconnect or invalidate one sensor.
- Show `SENSOR_CHECK` and that PlantLens refuses to invent a root cause.

## 6:00-6:50 - Dashboard and evidence

- Open raw signals, feature summary, causal path, alternative candidates, and audit/model version.
- Show repository structure and code briefly.

## 6:50-7:30 - Impact and close

- Explain the target users: small factories, labs, and retrofit rotating assets.
- State the read-only safety boundary.
- Close with: "PlantLens turns a machine's fingerprint into an evidence-backed maintenance decision - locally on Arduino UNO Q."

## Filming failures that can disqualify the submission

- cuts, jumps, or edited transitions
- date shown after the demonstration instead of at the beginning
- restricted/private link
- UNO Q not visible as the primary board
- narration claiming measured accuracy that is absent from the report/logs
- hiding the physical fault injection or alert response
