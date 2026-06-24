/**
 * Demo plant topology — scaffold data for Screen 01.
 * All IDs labelled as demo fallback; replaced by live topology when wired.
 */
import type { Situation } from "../store/useStore";
import type { AssetState } from "../three/ColorLanguage";

export interface DemoArea {
  id: string;
  name: string;
}

export interface DemoAsset {
  id: string;
  name: string;
  label: string;
  typeId: string;
  areaId: string;
  position: [number, number, number];
  state: AssetState;
  location: string;
}

export interface SituationMeta {
  location: string;
  assetId: string;
  severity: "warning" | "critical" | "unknown";
  supportingEvidence: string[];
  missingEvidence: string[];
  actionEnvelope: string;
  nextSteps: string;
}

export const DEMO_PLANT_NAME = "Demo Plant / Line A";

export const DEMO_AREAS: DemoArea[] = [
  { id: "area-a", name: "Area A" },
  { id: "area-b", name: "Area B" },
  { id: "utilities", name: "Utilities" },
];

export const DEMO_ASSETS: DemoAsset[] = [
  {
    id: "M-101",
    name: "Motor",
    label: "M-101 Motor",
    typeId: "induction_motor_3ph",
    areaId: "area-a",
    position: [-3, 0, 0],
    state: "warning",
    location: "M-101 / Drive Skid",
  },
  {
    id: "F-101",
    name: "Fan",
    label: "F-101 Fan",
    typeId: "centrifugal_fan",
    areaId: "area-a",
    position: [0, 0, 0],
    state: "normal",
    location: "F-101 / Cooling line",
  },
  {
    id: "B-101",
    name: "Blower",
    label: "B-101 Blower",
    typeId: "positive_displacement_blower",
    areaId: "area-a",
    position: [3, 0, 0],
    state: "normal",
    location: "B-101 / Process air",
  },
];

export const DEMO_ALARM_COLLAPSE = "14 raw alarms → 2 situations";

export const DEMO_SITUATIONS: Situation[] = [
  {
    id: "sit-motor-overload",
    primary_fault: "Motor overload suspected",
    confidence: 0.87,
    coverage: 0.72,
    grouping_confidence: 0.91,
    member_signals: ["I_motor_rising", "RPM_dropping", "Vibration_normal"],
    downstream: ["F-101"],
    spurious: [],
    ts: Date.now(),
  },
  {
    id: "sit-sensor-gap",
    primary_fault: "Sensor gap — temp evidence missing",
    confidence: 0.41,
    coverage: 0.38,
    grouping_confidence: 0.55,
    member_signals: ["Temp_missing", "I_motor_rising"],
    downstream: [],
    spurious: ["Ambient_humidity"],
    ts: Date.now() - 60_000,
  },
];

export const DEMO_SITUATION_META: Record<string, SituationMeta> = {
  "sit-motor-overload": {
    location: "M-101 / Drive Skid",
    assetId: "M-101",
    severity: "warning",
    supportingEvidence: ["Current rising", "RPM dropping", "Vibration normal"],
    missingEvidence: ["Temp evidence missing"],
    actionEnvelope: "Reduce motor load — AVAILABLE (no blockers)",
    nextSteps: "Verify load path, inspect coupling, reduce load",
  },
  "sit-sensor-gap": {
    location: "M-101 / Drive Skid",
    assetId: "M-101",
    severity: "unknown",
    supportingEvidence: ["Current rising"],
    missingEvidence: ["Temp sensor offline", "Coverage gap on bearing temp"],
    actionEnvelope: "Investigate sensor path — DEGRADED (temp channel offline)",
    nextSteps: "Restore temp sensor, verify I/O module health",
  },
};

export function getDemoAsset(id: string): DemoAsset | undefined {
  return DEMO_ASSETS.find((a) => a.id === id);
}

export function getSituationMeta(situationId: string): SituationMeta | undefined {
  return DEMO_SITUATION_META[situationId];
}

export function resolveSituations(live: Situation[]): Situation[] {
  return live.length > 0 ? live : DEMO_SITUATIONS;
}