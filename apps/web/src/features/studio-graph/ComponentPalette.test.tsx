import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ComponentCard } from "./ComponentCard";
import { ComponentIcon, isSafeInlineSvg } from "./ComponentIcon";
import { ComponentPalette } from "./ComponentPalette";
import type { ComponentTemplate } from "./componentLibraryTypes";

const SAMPLE: ComponentTemplate = {
  component_type_id: "dc_motor_12v",
  display_name: "12V DC Motor",
  category: "actuation_mechanical",
  description: "Brushed DC motor for bench applications.",
  version: "1.0.0",
  manufacturer_neutral: true,
  physical_domain: "electromechanical",
  ports: [
    {
      port_id: "power_in",
      name: "Power Input",
      direction: "input",
      medium: "dc_power",
      quantity_kind: "voltage",
      required: true,
    },
    {
      port_id: "shaft_out",
      name: "Shaft Output",
      direction: "output",
      medium: "mechanical_rotation",
      quantity_kind: "rpm",
      required: true,
    },
  ],
  signal_templates: [
    { signal_template_id: "motor_current", name: "Motor Current", quantity_kind: "current", unit: "A" },
    { signal_template_id: "motor_rpm", name: "Motor RPM", quantity_kind: "rpm", unit: "rpm" },
  ],
  fault_modes: [
    {
      fault_mode_id: "mechanical_obstruction",
      title: "Mechanical Obstruction",
      severity: "critical",
      operator_actions: ["Isolate power and verify shaft rotation."],
    },
    {
      fault_mode_id: "overcurrent",
      title: "Overcurrent",
      severity: "critical",
      operator_actions: ["Reduce mechanical load and verify free rotation."],
    },
  ],
  recommended_sensors: ["current_sensor", "rpm_tachometer"],
  safety_notes: ["Lock out drive before mechanical service."],
  tags: ["motor", "dc"],
  visual_asset: {
    icon_kind: "inline_svg",
    icon_svg: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="16" fill="#0E1A2A"/></svg>',
    node_shape: "hex_card",
    low_poly_shape: "cylinder_with_shaft",
    accent_role: "actuation",
    preview_label: "12V Motor",
    size_hint: { width: 180, height: 96 },
  },
};

const COMPONENTS: ComponentTemplate[] = [
  SAMPLE,
  {
    ...SAMPLE,
    component_type_id: "dc_power_supply",
    display_name: "DC Power Supply",
    category: "power_electrical",
    tags: ["power"],
    safety_notes: [],
    ports: [{ port_id: "dc_out", name: "DC Out", direction: "output", medium: "dc_power", quantity_kind: "voltage", required: true }],
    signal_templates: [],
    fault_modes: [
      { fault_mode_id: "a", title: "A", severity: "warning", operator_actions: ["Check terminals."] },
      { fault_mode_id: "b", title: "B", severity: "warning", operator_actions: ["Check load."] },
    ],
    recommended_sensors: [],
    visual_asset: { ...SAMPLE.visual_asset, preview_label: "DC Supply", accent_role: "power" },
  },
  {
    ...SAMPLE,
    component_type_id: "current_sensor",
    display_name: "Current Sensor",
    category: "sensors",
    tags: ["sensor"],
    safety_notes: [],
    ports: [{ port_id: "signal_out", name: "Out", direction: "output", medium: "analog_signal", quantity_kind: "current", required: true }],
    signal_templates: [{ signal_template_id: "measured_current", name: "Measured Current", quantity_kind: "current", unit: "A" }],
    fault_modes: [
      { fault_mode_id: "missing", title: "Missing", severity: "warning", operator_actions: ["Verify wiring."] },
      { fault_mode_id: "stale", title: "Stale", severity: "warning", operator_actions: ["Compare redundant path."] },
    ],
    recommended_sensors: [],
    visual_asset: { ...SAMPLE.visual_asset, preview_label: "I Sensor", accent_role: "sensor" },
  },
];

describe("ComponentPalette", () => {
  it("renders components", () => {
    render(<ComponentPalette components={COMPONENTS} />);
    expect(screen.getByText("12V DC Motor")).toBeInTheDocument();
    expect(screen.getByText("DC Power Supply")).toBeInTheDocument();
    expect(screen.getByText("Current Sensor")).toBeInTheDocument();
  });

  it("search filters components", () => {
    render(<ComponentPalette components={COMPONENTS} />);
    fireEvent.change(screen.getByLabelText("Search components"), { target: { value: "sensor" } });
    expect(screen.queryByText("12V DC Motor")).not.toBeInTheDocument();
    expect(screen.getByText("Current Sensor")).toBeInTheDocument();
  });

  it("category grouping works", () => {
    render(<ComponentPalette components={COMPONENTS} />);
    expect(screen.getByRole("heading", { name: "Power / Electrical" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sensors" })).toBeInTheDocument();
  });

  it("does not render hardware control buttons", () => {
    render(<ComponentPalette components={COMPONENTS} />);
    expect(screen.queryByRole("button", { name: /start motor/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /execute/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /hardware control/i })).not.toBeInTheDocument();
  });
});

describe("ComponentCard", () => {
  it("shows ports/signals/fault counts", () => {
    render(<ComponentCard component={SAMPLE} />);
    const stats = screen.getByRole("article").querySelector(".component-card__stats");
    expect(stats).not.toBeNull();
    const region = within(stats as HTMLElement);
    expect(region.getByText("Ports").nextElementSibling?.textContent).toBe("2");
    expect(region.getByText("Signals").nextElementSibling?.textContent).toBe("2");
    expect(region.getByText("Faults").nextElementSibling?.textContent).toBe("2");
    expect(region.getByText("Sensors").nextElementSibling?.textContent).toBe("2");
  });
});

describe("ComponentIcon", () => {
  it("rejects unsafe SVG with script tags", () => {
    expect(isSafeInlineSvg('<svg viewBox="0 0 10 10"><script>alert(1)</script></svg>')).toBe(false);
    render(<ComponentIcon svg={'<svg viewBox="0 0 10 10"><script/></svg>'} label="Bad" />);
    expect(screen.getByLabelText("Bad")).toHaveClass("component-icon--fallback");
  });

  it("accepts safe repo-owned SVG", () => {
    const svg = '<svg viewBox="0 0 64 64"><rect width="64" height="64"/></svg>';
    expect(isSafeInlineSvg(svg)).toBe(true);
    render(<ComponentIcon svg={svg} label="Good" />);
    expect(screen.getByLabelText("Good")).not.toHaveClass("component-icon--fallback");
  });
});