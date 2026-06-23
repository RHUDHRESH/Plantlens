import plantLayoutJson from "./data/plant_layout.json";
import type { EquipmentMapInfo, PlantLayoutPositions } from "./types";

export const PLANT_CONNECTIONS: Array<[string, string]> = [
  ["PV-101", "MPPT-101"],
  ["MPPT-101", "BAT-101"],
  ["BAT-101", "BUS-101"],
  ["BUS-101", "INV-101"],
  ["INV-101", "LD-201"],
  ["BUS-101", "INV-102"],
  ["INV-102", "MTR-301"],
];

export const EQUIPMENT_INFO: Record<string, EquipmentMapInfo> = {
  "PV-101": { label: "PV Array", width: 110, height: 56, primaryTag: "PV_101_V", unit: "V" },
  "MPPT-101": { label: "MPPT", width: 100, height: 50 },
  "BAT-101": { label: "Battery", width: 100, height: 56, primaryTag: "BAT_101_V", unit: "V" },
  "BUS-101": { label: "DC Bus", width: 130, height: 50, primaryTag: "BUS_101_V", unit: "V" },
  "INV-101": { label: "Lamp Inv", width: 100, height: 50 },
  "LD-201": { label: "Lamp Load", width: 100, height: 50 },
  "INV-102": { label: "Motor Inv", width: 110, height: 56, primaryTag: "VFD_V", unit: "V" },
  "MTR-301": { label: "Motor M-301", width: 130, height: 72, primaryTag: "MOTOR_301_RPM", unit: "rpm" },
};

export function getPlantLayoutPositions(): PlantLayoutPositions {
  return plantLayoutJson.plant_layout.positions as PlantLayoutPositions;
}