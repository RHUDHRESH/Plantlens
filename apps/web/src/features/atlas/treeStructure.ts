import type { AtlasTreeNode } from "./types";

/** Demo microgrid hierarchy — mapped to plant.json asset IDs and live tag_map tags. */
export const DEMO_TREE_STRUCTURE: AtlasTreeNode[] = [
  {
    id: "SOURCES",
    label: "Sources",
    expanded: true,
    children: [
      {
        id: "PV",
        label: "PV Branch",
        equipment_id: "PV-101",
        tags: ["PV_101_V", "PV_101_I"],
      },
    ],
  },
  {
    id: "BATTERY_BUS",
    label: "Battery / DC Bus",
    expanded: true,
    children: [
      {
        id: "BAT",
        label: "Battery Bank",
        equipment_id: "BAT-101",
        tags: ["BAT_101_V", "BAT_101_I"],
      },
      {
        id: "BUS",
        label: "DC Bus",
        equipment_id: "BUS-101",
        tags: ["BUS_101_V"],
      },
    ],
  },
  {
    id: "INVERTER",
    label: "Motor Inverter",
    equipment_id: "INV-102",
    tags: ["INV_102_V", "INV_102_I"],
  },
  {
    id: "VFD",
    label: "VFD",
    equipment_id: "INV-102",
    tags: ["VFD_V", "VFD_I"],
  },
  {
    id: "MOTOR",
    label: "Motor M-301",
    expanded: true,
    equipment_id: "MTR-301",
    tags: ["MOTOR_301_RPM", "MOTOR_301_VIB", "MOTOR_301_TEMP"],
    children: [
      { id: "MOTOR_SPEED", label: "Speed", tags: ["MOTOR_301_RPM"] },
      { id: "MOTOR_VIB", label: "Vibration", tags: ["MOTOR_301_VIB"] },
      { id: "MOTOR_TEMP", label: "Temperature", tags: ["MOTOR_301_TEMP"] },
    ],
  },
];

export const DEFAULT_TREE_EXPANDED: Record<string, boolean> = {
  SOURCES: true,
  BATTERY_BUS: true,
  INVERTER: false,
  VFD: false,
  MOTOR: true,
};