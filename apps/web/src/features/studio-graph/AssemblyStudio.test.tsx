import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { AssemblyInspector } from "./AssemblyInspector";
import { ComponentPalette } from "./ComponentPalette";
import { checkPortCompatibilityLocal } from "./connectionValidation";
import type { ComponentTemplate } from "./componentLibraryTypes";
import { useAssemblyStudioStore, buildConnectionFromPorts } from "./studioAssemblyState";

const MOTOR: ComponentTemplate = {
  component_type_id: "dc_motor_12v",
  display_name: "12V DC Motor",
  category: "actuation_mechanical",
  description: "Motor",
  version: "1.0.0",
  manufacturer_neutral: true,
  physical_domain: "electromechanical",
  ports: [
    { port_id: "power_in", name: "Power", direction: "input", medium: "dc_power", quantity_kind: "voltage", required: true },
    { port_id: "shaft_out", name: "Shaft", direction: "output", medium: "mechanical_rotation", quantity_kind: "rpm", required: true },
  ],
  signal_templates: [],
  fault_modes: [],
  recommended_sensors: [],
  safety_notes: ["Lock out"],
  tags: ["motor"],
  visual_asset: {
    icon_kind: "inline_svg",
    node_shape: "hex_card",
    low_poly_shape: "cylinder",
    accent_role: "actuation",
    preview_label: "Motor",
    size_hint: { width: 180, height: 96 },
    port_layout: { left: ["power_in"], right: ["shaft_out"], top: [], bottom: [] },
  },
};

const SUPPLY: ComponentTemplate = {
  ...MOTOR,
  component_type_id: "dc_power_supply",
  display_name: "DC Power Supply",
  category: "power_electrical",
  safety_notes: [],
  ports: [
    { port_id: "dc_out", name: "DC Out", direction: "output", medium: "dc_power", quantity_kind: "voltage", required: true },
  ],
  visual_asset: { ...MOTOR.visual_asset, port_layout: { left: [], right: ["dc_out"], top: [], bottom: [] } },
};

const DUCT: ComponentTemplate = {
  ...MOTOR,
  component_type_id: "air_duct",
  display_name: "Air Duct",
  category: "process_physical",
  safety_notes: [],
  ports: [
    { port_id: "air_in", name: "Air In", direction: "input", medium: "airflow", quantity_kind: "airflow", required: true },
  ],
  visual_asset: { ...MOTOR.visual_asset, port_layout: { left: ["air_in"], right: [], top: [], bottom: [] } },
};

const SENSOR: ComponentTemplate = {
  ...MOTOR,
  component_type_id: "voltage_sensor",
  display_name: "Voltage Sensor",
  category: "sensors",
  safety_notes: [],
  ports: [
    { port_id: "signal_out", name: "Out", direction: "output", medium: "analog_signal", quantity_kind: "voltage", required: true },
  ],
  visual_asset: { ...MOTOR.visual_asset, port_layout: { left: [], right: ["signal_out"], top: [], bottom: [] } },
};

describe("connectionValidation", () => {
  it("accepts compatible DC power connection", () => {
    const result = checkPortCompatibilityLocal(SUPPLY, "dc_out", MOTOR, "power_in");
    expect(result.compatible).toBe(true);
  });

  it("rejects analog sensor to airflow inlet", () => {
    const result = checkPortCompatibilityLocal(SENSOR, "signal_out", DUCT, "air_in");
    expect(result.compatible).toBe(false);
    expect(result.reason).toMatch(/Incompatible media/i);
  });
});

describe("studioAssemblyState", () => {
  beforeEach(() => {
    useAssemblyStudioStore.getState().resetAssembly();
    useAssemblyStudioStore.getState().setLibrary([SUPPLY, MOTOR, DUCT, SENSOR]);
  });

  it("adding component creates asset instance", () => {
    const id = useAssemblyStudioStore.getState().addAsset(MOTOR, { x: 10, y: 20 });
    const assets = useAssemblyStudioStore.getState().assembly.assets;
    expect(assets).toHaveLength(1);
    expect(assets[0]?.asset_id).toBe(id);
    expect(assets[0]?.component_type_id).toBe("dc_motor_12v");
  });

  it("adds compatible connection to assembly state", () => {
    const store = useAssemblyStudioStore.getState();
    const motorId = store.addAsset(MOTOR, { x: 0, y: 0 });
    const supplyId = store.addAsset(SUPPLY, { x: 0, y: 0 });
    store.addConnection(
      buildConnectionFromPorts(supplyId, "dc_out", motorId, "power_in", "dc_power", 0),
    );
    expect(useAssemblyStudioStore.getState().assembly.connections).toHaveLength(1);
  });

  it("approved toggle changes only assembly state", () => {
    const store = useAssemblyStudioStore.getState();
    const motorId = store.addAsset(MOTOR, { x: 0, y: 0 });
    const supplyId = store.addAsset(SUPPLY, { x: 0, y: 0 });
    store.addConnection(
      buildConnectionFromPorts(supplyId, "dc_out", motorId, "power_in", "dc_power", 0),
    );
    const connId = useAssemblyStudioStore.getState().assembly.connections[0]!.connection_id;
    store.updateConnection(connId, { approved: false });
    expect(useAssemblyStudioStore.getState().assembly.connections[0]?.approved).toBe(false);
  });
});

describe("ComponentPalette assembly integration", () => {
  it("renders palette with add buttons", () => {
    const onAdd = vi.fn();
    render(<ComponentPalette components={[MOTOR, SUPPLY]} onAddComponent={onAdd} />);
    expect(screen.getByText("12V DC Motor")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /add to canvas/i })[0]!);
    expect(onAdd).toHaveBeenCalled();
  });

  it("does not render hardware control buttons", () => {
    render(<ComponentPalette components={[MOTOR]} onAddComponent={() => {}} />);
    expect(screen.queryByRole("button", { name: /start motor/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /execute/i })).not.toBeInTheDocument();
  });
});

describe("AssemblyInspector", () => {
  it("shows selected connection details", () => {
    render(
      <AssemblyInspector
        asset={null}
        connection={{
          connection_id: "C001",
          from_asset_id: "dc_power_supply_1",
          from_port_id: "dc_out",
          to_asset_id: "dc_motor_12v_1",
          to_port_id: "power_in",
          connection_kind: "power",
          approved: true,
          lag_min_ms: 0,
          lag_max_ms: 100,
          notes: "feed",
        }}
        fromTemplate={SUPPLY}
        toTemplate={MOTOR}
        compatibilityReason="Ports are compatible."
        compatibilityWarnings={[]}
        onToggleApproved={() => {}}
        onUpdateLag={() => {}}
        onUpdateNotes={() => {}}
      />,
    );
    expect(screen.getByText(/dc_power_supply_1.dc_out/)).toBeInTheDocument();
    expect(screen.getByText(/Ports are compatible/)).toBeInTheDocument();
  });
});