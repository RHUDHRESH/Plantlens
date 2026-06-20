import type { HmiPreviewInput } from "../../app/schemas/plantHmi";
import airflowBlockage from "./fixtures/airflow_blockage.json";
import healthy from "./fixtures/healthy_motor_fan_blower.json";
import missingSensor from "./fixtures/missing_sensor.json";
import motorObstruction from "./fixtures/motor_obstruction.json";
import staleSensor from "./fixtures/stale_sensor.json";
import voltageSag from "./fixtures/voltage_sag.json";

export interface ScenarioOption {
  id: string;
  label: string;
  buildRequest: () => HmiPreviewInput;
}

const GATE_BLOCKER: HmiPreviewInput["gate_results"] = [
  {
    gate_name: "artifact_integrity",
    verdict: "fail",
    issues: [
      {
        code: "HASH_MISMATCH",
        severity: "BLOCKER",
        message: "hash mismatch",
      },
    ],
  },
];

export const HMI_SCENARIOS: ScenarioOption[] = [
  {
    id: "healthy",
    label: "Healthy",
    buildRequest: () => ({ canonical_payload: healthy }),
  },
  {
    id: "motor_obstruction",
    label: "Motor obstruction",
    buildRequest: () => ({ canonical_payload: motorObstruction }),
  },
  {
    id: "voltage_sag",
    label: "Voltage sag",
    buildRequest: () => ({ canonical_payload: voltageSag }),
  },
  {
    id: "airflow_blockage",
    label: "Airflow blockage",
    buildRequest: () => ({ canonical_payload: airflowBlockage }),
  },
  {
    id: "stale_sensor",
    label: "Stale sensor",
    buildRequest: () => ({ canonical_payload: staleSensor }),
  },
  {
    id: "missing_sensor",
    label: "Missing sensor",
    buildRequest: () => ({ canonical_payload: missingSensor }),
  },
  {
    id: "gate_blocker",
    label: "Gate blocker demo",
    buildRequest: () => ({
      canonical_payload: healthy,
      gate_results: GATE_BLOCKER,
    }),
  },
];