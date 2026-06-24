/**
 * Demo layout draft data — frontend-only model authoring scaffold.
 */
import type {
  BlockPaletteItem,
  LayoutBlockModel,
  LayoutConnectionModel,
  LayoutValidationIssue,
  LayoutValidationStatus,
} from "./layoutStudioTypes";

export const DEMO_PALETTE_ITEMS: BlockPaletteItem[] = [
  {
    id: "pal-motor-dc",
    label: "DC Motor",
    typeId: "motor.dc",
    kind: "motor",
    category: "motors",
    geometryRef: "geo/motor-dc-v1",
    description: "Brushed DC motor block with current and RPM bindings.",
  },
  {
    id: "pal-motor-3ph",
    label: "3PH Motor",
    typeId: "motor.3ph",
    kind: "motor",
    category: "motors",
    geometryRef: "geo/motor-3ph-v1",
    description: "Three-phase induction motor with power and thermal bindings.",
  },
  {
    id: "pal-fan-axial",
    label: "Axial Fan",
    typeId: "fan.axial",
    kind: "fan",
    category: "air",
    geometryRef: "geo/fan-axial-v1",
    description: "Axial airflow block with RPM and flow rate bindings.",
  },
  {
    id: "pal-blower-cent",
    label: "Centrifugal Blower",
    typeId: "blower.centrifugal",
    kind: "blower",
    category: "air",
    geometryRef: "geo/blower-cent-v1",
    description: "Centrifugal blower with pressure and flow bindings.",
  },
  {
    id: "pal-power-dc-bus",
    label: "DC Bus",
    typeId: "power.dc_bus",
    kind: "power",
    category: "power",
    geometryRef: "geo/dc-bus-v1",
    description: "DC power distribution bus block.",
  },
  {
    id: "pal-power-relay",
    label: "Relay",
    typeId: "power.relay",
    kind: "relay",
    category: "power",
    geometryRef: "geo/relay-v1",
    description: "Contactor / relay switching block.",
  },
  {
    id: "pal-plc-io",
    label: "PLC + I/O",
    typeId: "plc.io",
    kind: "plc",
    category: "control",
    geometryRef: "geo/plc-io-v1",
    description: "PLC controller with I/O rack bindings.",
  },
  {
    id: "pal-sensor-current",
    label: "Current Sensor",
    typeId: "sensor.current",
    kind: "sensor",
    category: "sensors",
    geometryRef: "geo/sensor-current-v1",
    description: "Current transducer with analog output binding.",
  },
  {
    id: "pal-sensor-temp",
    label: "Temp Sensor",
    typeId: "sensor.temperature",
    kind: "sensor",
    category: "sensors",
    geometryRef: "geo/sensor-temp-v1",
    description: "Temperature probe with optional binding.",
  },
  {
    id: "pal-sensor-vib",
    label: "Vibration Sensor",
    typeId: "sensor.vibration",
    kind: "sensor",
    category: "sensors",
    geometryRef: "geo/sensor-vib-v1",
    description: "Vibration accelerometer with FFT binding.",
  },
  {
    id: "pal-group-skid",
    label: "Skid Group",
    typeId: "group.skid",
    kind: "group",
    category: "groups",
    geometryRef: "geo/group-skid-v1",
    description: "Logical skid grouping container.",
  },
  {
    id: "pal-group-area",
    label: "Area Group",
    typeId: "group.area",
    kind: "group",
    category: "groups",
    geometryRef: "geo/group-area-v1",
    description: "Plant area grouping container.",
  },
];

export const DEMO_LAYOUT_BLOCKS: LayoutBlockModel[] = [
  {
    id: "blk-pwr-101",
    instanceId: "PWR-101",
    label: "DC BUS",
    typeId: "power.dc_bus",
    kind: "power",
    x: 110,
    y: 110,
    z: 0,
    status: "draft",
    bindings: [{ signal: "voltage", status: "bound", source: "sim.bus" }],
  },
  {
    id: "blk-rly-101",
    instanceId: "RLY-101",
    label: "RELAY",
    typeId: "power.relay",
    kind: "relay",
    x: 310,
    y: 110,
    z: 0,
    status: "draft",
    bindings: [{ signal: "coil", status: "bound", source: "sim.relay" }],
  },
  {
    id: "blk-m-101",
    instanceId: "M-101",
    label: "MOTOR",
    typeId: "motor.dc",
    kind: "motor",
    x: 510,
    y: 110,
    z: 0,
    status: "warning",
    bindings: [
      { signal: "current", status: "bound", source: "I-101" },
      { signal: "rpm", status: "bound", source: "sim.motor" },
      { signal: "temp", status: "optional" },
      { signal: "vibration", status: "bound", source: "sim.vib" },
    ],
  },
  {
    id: "blk-f-101",
    instanceId: "F-101",
    label: "FAN",
    typeId: "fan.axial",
    kind: "fan",
    x: 360,
    y: 270,
    z: 0,
    status: "draft",
    bindings: [
      { signal: "rpm", status: "bound", source: "sim.fan" },
      { signal: "flow", status: "bound", source: "sim.flow" },
    ],
  },
  {
    id: "blk-b-101",
    instanceId: "B-101",
    label: "BLOWER",
    typeId: "blower.centrifugal",
    kind: "blower",
    x: 560,
    y: 270,
    z: 0,
    status: "draft",
    bindings: [
      { signal: "pressure", status: "bound", source: "sim.blower" },
      { signal: "flow", status: "bound", source: "sim.flow" },
    ],
  },
  {
    id: "blk-i-101",
    instanceId: "I-101",
    label: "Current Sensor",
    typeId: "sensor.current",
    kind: "sensor",
    x: 130,
    y: 390,
    z: 0,
    status: "draft",
    bindings: [{ signal: "current", status: "bound", source: "sim.ct" }],
  },
  {
    id: "blk-t-101",
    instanceId: "T-101",
    label: "Temp Sensor",
    typeId: "sensor.temperature",
    kind: "sensor",
    x: 310,
    y: 390,
    z: 0,
    status: "draft",
    bindings: [{ signal: "temp", status: "optional" }],
  },
  {
    id: "blk-plc-101",
    instanceId: "PLC-101",
    label: "PLC + I/O",
    typeId: "plc.io",
    kind: "plc",
    x: 460,
    y: 470,
    z: 0,
    status: "draft",
    bindings: [
      { signal: "di", status: "bound", source: "sim.plc" },
      { signal: "do", status: "bound", source: "sim.plc" },
      { signal: "ai", status: "bound", source: "sim.plc" },
    ],
  },
];

export const DEMO_LAYOUT_CONNECTIONS: LayoutConnectionModel[] = [
  {
    id: "conn-1",
    sourceId: "blk-pwr-101",
    targetId: "blk-rly-101",
    kind: "power",
    label: "power",
    status: "valid",
  },
  {
    id: "conn-2",
    sourceId: "blk-rly-101",
    targetId: "blk-m-101",
    kind: "power",
    label: "power",
    status: "valid",
  },
  {
    id: "conn-3",
    sourceId: "blk-m-101",
    targetId: "blk-f-101",
    kind: "process",
    label: "drive",
    status: "valid",
  },
  {
    id: "conn-4",
    sourceId: "blk-f-101",
    targetId: "blk-b-101",
    kind: "process",
    label: "airflow",
    status: "valid",
  },
  {
    id: "conn-5",
    sourceId: "blk-i-101",
    targetId: "blk-plc-101",
    kind: "signal",
    label: "4–20 mA",
    status: "valid",
  },
  {
    id: "conn-6",
    sourceId: "blk-t-101",
    targetId: "blk-plc-101",
    kind: "signal",
    label: "RTD",
    status: "valid",
  },
  {
    id: "conn-7",
    sourceId: "blk-plc-101",
    targetId: "blk-m-101",
    kind: "dependency",
    label: "read-only",
    status: "valid",
  },
];

export const DEMO_VALIDATION_ISSUES: LayoutValidationIssue[] = [
  { id: "v-info-blocks", severity: "info", message: "8 blocks placed" },
  { id: "v-info-conn", severity: "info", message: "7 draft connections valid" },
  {
    id: "v-warn-temp",
    severity: "warning",
    message: "M-101 temperature binding optional / incomplete",
    blockId: "blk-m-101",
  },
  {
    id: "v-info-hmi",
    severity: "info",
    message: "HMI preview can be generated from current layout",
  },
];

const INSTANCE_PREFIX: Record<string, string> = {
  motor: "M",
  fan: "F",
  blower: "B",
  sensor: "S",
  power: "PWR",
  relay: "RLY",
  plc: "PLC",
  group: "GRP",
};

export function createBlockFromPalette(
  item: BlockPaletteItem,
  x: number,
  y: number,
  existingBlocks: LayoutBlockModel[],
): LayoutBlockModel {
  const prefix = INSTANCE_PREFIX[item.kind] ?? "BLK";
  const count =
    existingBlocks.filter((b) => b.kind === item.kind).length + 101;
  const instanceId = `${prefix}-${count}`;
  const id = `blk-${instanceId.toLowerCase()}`;

  const defaultBindings: LayoutBlockModel["bindings"] =
    item.kind === "motor"
      ? [
          { signal: "current", status: "missing" },
          { signal: "rpm", status: "missing" },
        ]
      : item.kind === "sensor"
        ? [{ signal: item.typeId.split(".")[1] ?? "signal", status: "missing" }]
        : item.kind === "plc"
          ? [
              { signal: "di", status: "missing" },
              { signal: "do", status: "missing" },
            ]
          : [];

  return {
    id,
    instanceId,
    label: item.label.toUpperCase(),
    typeId: item.typeId,
    kind: item.kind,
    x: Math.round(x / 20) * 20,
    y: Math.round(y / 20) * 20,
    z: 0,
    status: "draft",
    bindings: defaultBindings,
  };
}

export function validateLayoutDraft(
  blocks: LayoutBlockModel[],
  connections: LayoutConnectionModel[],
): { status: LayoutValidationStatus; items: LayoutValidationIssue[] } {
  const items: LayoutValidationIssue[] = [];

  if (blocks.length === 0) {
    items.push({ id: "v-err-empty", severity: "error", message: "No blocks placed" });
    return { status: "error", items };
  }

  items.push({
    id: "v-info-blocks",
    severity: "info",
    message: `${blocks.length} block${blocks.length === 1 ? "" : "s"} placed`,
  });

  const validConnections = connections.filter((c) => c.status !== "error");
  items.push({
    id: "v-info-conn",
    severity: "info",
    message: `${validConnections.length} draft connection${validConnections.length === 1 ? "" : "s"} valid`,
  });

  let missingBindings = 0;
  for (const block of blocks) {
    for (const binding of block.bindings) {
      if (binding.status === "missing") {
        missingBindings++;
        items.push({
          id: `v-err-bind-${block.id}-${binding.signal}`,
          severity: "error",
          message: `${block.instanceId} missing required binding: ${binding.signal}`,
          blockId: block.id,
        });
      } else if (binding.status === "optional") {
        items.push({
          id: `v-warn-opt-${block.id}-${binding.signal}`,
          severity: "warning",
          message: `${block.instanceId} ${binding.signal} binding optional / incomplete`,
          blockId: block.id,
        });
      }
    }
  }

  if (missingBindings === 0) {
    items.push({
      id: "v-info-hmi",
      severity: "info",
      message: "HMI preview can be generated from current layout",
    });
  }

  const blockIds = new Set(blocks.map((b) => b.id));
  for (const conn of connections) {
    if (!blockIds.has(conn.sourceId) || !blockIds.has(conn.targetId)) {
      items.push({
        id: `v-err-conn-${conn.id}`,
        severity: "error",
        message: `Connection ${conn.label} references missing block`,
        connectionId: conn.id,
      });
    }
  }

  const hasError = items.some((i) => i.severity === "error");
  const hasWarning = items.some((i) => i.severity === "warning");
  const status: LayoutValidationStatus = hasError
    ? "error"
    : hasWarning
      ? "warning"
      : "valid";

  return { status, items };
}

export function getPaletteItem(id: string): BlockPaletteItem | undefined {
  return DEMO_PALETTE_ITEMS.find((p) => p.id === id);
}