/** Small, explicit component set for rule-engine tests (kept separate from the sample library). */
import type { RuleAssembly, RuleComponent, RuleConnection } from "./types";

export const PSU: RuleComponent = {
  component_type_id: "dc_power_supply",
  display_name: "DC Power Supply",
  category: "power_electrical",
  tags: ["power", "dc"],
  ports: [
    { port_id: "ac_in", name: "AC Input", direction: "input", medium: "ac_power", quantity_kind: "voltage", required: true, nominal_range: { min: 100, max: 240 } },
    { port_id: "dc_out", name: "DC Output", direction: "output", medium: "dc_power", quantity_kind: "voltage", required: true, nominal_range: { min: 11, max: 13.5 }, compatibility_tags: ["dc_12v"] },
    { port_id: "sense_out", name: "Sense Output", direction: "output", medium: "analog_signal", quantity_kind: "voltage", required: false },
  ],
};

export const MOTOR: RuleComponent = {
  component_type_id: "dc_motor_12v",
  display_name: "12V DC Motor",
  category: "actuation_mechanical",
  tags: ["motor"],
  ports: [
    { port_id: "power_in", name: "Power Input", direction: "input", medium: "dc_power", quantity_kind: "voltage", required: true, nominal_range: { min: 11, max: 13 }, compatibility_tags: ["dc_12v"] },
    { port_id: "shaft_out", name: "Shaft", direction: "output", medium: "mechanical_rotation", quantity_kind: "rpm", required: true },
    { port_id: "power_out", name: "Aux Power", direction: "output", medium: "dc_power", quantity_kind: "voltage", required: false },
  ],
};

export const HV_LOAD: RuleComponent = {
  component_type_id: "hv_load",
  display_name: "48V Load",
  category: "actuation_mechanical",
  tags: ["load"],
  ports: [
    { port_id: "power_in", name: "Power Input", direction: "input", medium: "dc_power", quantity_kind: "voltage", required: true, nominal_range: { min: 40, max: 56 } },
  ],
};

export const SENSOR: RuleComponent = {
  component_type_id: "voltage_sensor",
  display_name: "Voltage Sensor",
  category: "sensors",
  tags: ["sensor", "voltage"],
  ports: [
    { port_id: "sense_in", name: "Sense", direction: "input", medium: "dc_power", quantity_kind: "voltage", required: true },
    { port_id: "signal_out", name: "Signal", direction: "output", medium: "analog_signal", quantity_kind: "voltage", required: true },
  ],
};

export const PLC_AI: RuleComponent = {
  component_type_id: "plc_analog_input_module",
  display_name: "PLC AI",
  category: "power_electrical",
  tags: ["plc"],
  ports: [
    { port_id: "ai_ch1", name: "AI 1", direction: "input", medium: "analog_signal", quantity_kind: "data", required: true },
    { port_id: "ai_ch2", name: "AI 2", direction: "input", medium: "analog_signal", quantity_kind: "data", required: false },
    { port_id: "logic", name: "Logic", direction: "bidirectional", medium: "ethernet", quantity_kind: "data", required: true },
  ],
};

export const SHAFT_TOOL: RuleComponent = {
  component_type_id: "belt_coupling",
  display_name: "Belt Coupling",
  category: "actuation_mechanical",
  tags: ["coupling"],
  ports: [
    { port_id: "shaft_in", name: "Shaft In", direction: "input", medium: "mechanical_rotation", quantity_kind: "rpm", required: true, compatibility_tags: ["belt"] },
    { port_id: "shaft_out", name: "Shaft Out", direction: "output", medium: "mechanical_rotation", quantity_kind: "rpm", required: true },
  ],
};

export const TORQUE_TOOL: RuleComponent = {
  component_type_id: "torque_tool",
  display_name: "Torque Tool",
  category: "actuation_mechanical",
  tags: [],
  ports: [{ port_id: "torque_in", name: "Torque", direction: "input", medium: "mechanical_rotation", quantity_kind: "torque", required: true }],
};

export const ALL_COMPONENTS = [PSU, MOTOR, HV_LOAD, SENSOR, PLC_AI, SHAFT_TOOL, TORQUE_TOOL];

export function asset(id: string, component: RuleComponent) {
  return { asset_id: id, component_type_id: component.component_type_id, display_name: id };
}

export function conn(id: string, from: string, fromPort: string, to: string, toPort: string): RuleConnection {
  return { connection_id: id, from_asset_id: from, from_port_id: fromPort, to_asset_id: to, to_port_id: toPort };
}

export function assembly(connections: RuleConnection[] = [], metadata: Record<string, unknown> = {}): RuleAssembly {
  return {
    assets: [
      asset("PSU1", PSU),
      asset("PSU2", PSU),
      asset("M1", MOTOR),
      asset("M2", MOTOR),
      asset("HV1", HV_LOAD),
      asset("S1", SENSOR),
      asset("PLC1", PLC_AI),
      asset("PLC2", PLC_AI),
      asset("B1", SHAFT_TOOL),
      asset("B2", SHAFT_TOOL),
      asset("T1", TORQUE_TOOL),
    ],
    connections,
    metadata,
  };
}
