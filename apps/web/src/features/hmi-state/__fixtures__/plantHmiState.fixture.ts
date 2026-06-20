import type { PlantHMIState } from "../../../app/schemas/plantHmi";
import plantHmiStates from "./plantHmiStates.json";

export const healthyHmiState = plantHmiStates.healthy as PlantHMIState;

const motorBase = plantHmiStates.motor as PlantHMIState;

export const motorObstructionHmiState: PlantHMIState = {
  ...motorBase,
  active_incident: motorBase.active_incident
    ? { ...motorBase.active_incident, confidence: 0.82 }
    : null,
  root_cause_candidates: motorBase.root_cause_candidates.map((candidate) => ({
    ...candidate,
    confidence: 0.82,
  })),
};

export const blockedHmiState = plantHmiStates.blocked as PlantHMIState;

export const staleSensorHmiState = plantHmiStates.stale as PlantHMIState;