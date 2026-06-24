/**
 * Demo HMI compiler data — generated preview scaffold, not live deployment.
 */
import type {
  CompilerValidationItem,
  GeneratedScreenSpec,
  GeneratedWidgetBinding,
  HmiCompilerSummary,
  HmiValidationStatus,
  SourceModelFile,
} from "./hmiCompilerTypes";

export const DEMO_GENERATED_SCREENS: GeneratedScreenSpec[] = [
  {
    id: "l1_overview",
    label: "L1 Overview",
    kind: "overview",
    roleTargets: ["operator", "supervisor", "engineer"],
    deviceTargets: ["desktop", "tablet", "mobile"],
    widgetCount: 8,
    bindingCount: 12,
    status: "generated",
  },
  {
    id: "l2_line_a",
    label: "L2 Line A",
    kind: "line",
    roleTargets: ["operator", "maintenance", "supervisor", "engineer"],
    deviceTargets: ["desktop", "tablet", "mobile"],
    widgetCount: 10,
    bindingCount: 18,
    status: "generated",
  },
  {
    id: "l3_m101",
    label: "L3 M-101 Asset",
    kind: "asset",
    roleTargets: ["operator", "maintenance", "supervisor", "engineer"],
    deviceTargets: ["desktop", "tablet"],
    widgetCount: 7,
    bindingCount: 10,
    status: "generated",
  },
  {
    id: "evidence_room",
    label: "Evidence Room",
    kind: "evidence",
    roleTargets: ["maintenance", "supervisor", "engineer"],
    deviceTargets: ["desktop", "tablet"],
    widgetCount: 6,
    bindingCount: 9,
    status: "generated",
  },
  {
    id: "engineer_dag",
    label: "Engineer DAG View",
    kind: "dag",
    roleTargets: ["engineer"],
    deviceTargets: ["desktop"],
    widgetCount: 5,
    bindingCount: 8,
    status: "generated",
  },
  {
    id: "mobile_operator",
    label: "Mobile Operator View",
    kind: "mobile",
    roleTargets: ["operator", "maintenance"],
    deviceTargets: ["mobile"],
    widgetCount: 6,
    bindingCount: 7,
    status: "generated",
  },
];

export const DEMO_SOURCE_FILES: SourceModelFile[] = [
  { id: "plant", filename: "plant.json", purpose: "Plant topology and areas", status: "valid" },
  {
    id: "layout",
    filename: "plant_layout.json",
    purpose: "Spatial block placement from layout studio",
    status: "valid",
  },
  {
    id: "asset_types",
    filename: "asset_types.json",
    purpose: "Parameterized asset block definitions",
    status: "valid",
  },
  { id: "signals", filename: "signals.json", purpose: "Canonical signal bindings", status: "valid" },
  { id: "faults", filename: "faults.json", purpose: "Fault mode catalog", status: "valid" },
  { id: "graph", filename: "graph.json", purpose: "Causal DAG edges", status: "valid" },
  { id: "actions", filename: "actions.json", purpose: "Safe action envelopes", status: "valid" },
  { id: "roles", filename: "roles.json", purpose: "Role-specific UI visibility", status: "valid" },
  { id: "templates", filename: "templates.json", purpose: "HMI screen templates", status: "valid" },
];

export const DEMO_WIDGET_BINDINGS: GeneratedWidgetBinding[] = [
  {
    id: "w-map",
    widget: "3D map",
    boundTo: "layout blocks",
    sourceFile: "plant_layout.json",
    reason: "Spatial overview from authored layout",
    status: "bound",
  },
  {
    id: "w-status",
    widget: "Status strip",
    boundTo: "plant state",
    sourceFile: "plant.json",
    reason: "Always visible connection and source health",
    status: "bound",
  },
  {
    id: "w-mesh",
    widget: "Asset mesh",
    boundTo: "equipment instances",
    sourceFile: "asset_types.json + plant_layout.json",
    reason: "Model-driven equipment rendering",
    status: "bound",
  },
  {
    id: "w-calm",
    widget: "Calm card",
    boundTo: "situations",
    sourceFile: "signals.json",
    reason: "Operator action when situation active",
    status: "bound",
  },
  {
    id: "w-evidence",
    widget: "Evidence button",
    boundTo: "evidence trace",
    sourceFile: "graph.json",
    reason: "Traceability to causal proof path",
    status: "bound",
  },
  {
    id: "w-role",
    widget: "Role switch",
    boundTo: "role context",
    sourceFile: "roles.json",
    reason: "Context-specific UI visibility",
    status: "bound",
  },
  {
    id: "w-action",
    widget: "Action envelope",
    boundTo: "recommended actions",
    sourceFile: "actions.json",
    reason: "Safe read-only recommended actions",
    status: "bound",
  },
  {
    id: "w-dag",
    widget: "DAG link",
    boundTo: "causal graph",
    sourceFile: "graph.json",
    reason: "Engineer causal proof path",
    status: "bound",
  },
  {
    id: "w-degraded",
    widget: "Degraded banner",
    boundTo: "source health",
    sourceFile: "plant.json",
    reason: "Fallback visibility when source degraded",
    status: "bound",
  },
  {
    id: "w-temp",
    widget: "Temp binding",
    boundTo: "M-101 temperature",
    sourceFile: "signals.json",
    reason: "Optional thermal monitoring for motor",
    status: "warning",
  },
];

export const DEMO_COMPILER_SUMMARY: HmiCompilerSummary = {
  screensGenerated: 6,
  widgetsGenerated: 38,
  bindingsCreated: 12,
  roleVariants: 4,
  deviceVariants: 3,
};

export const DEMO_HMI_VALIDATION_ITEMS: CompilerValidationItem[] = [
  { id: "v-screens", severity: "info", message: "6 screens generated" },
  { id: "v-widgets", severity: "info", message: "38 widgets generated" },
  { id: "v-bindings", severity: "info", message: "12 critical bindings valid" },
  { id: "v-roles", severity: "info", message: "4 role variants ready" },
  {
    id: "v-temp",
    severity: "warning",
    message: "Optional temperature binding incomplete for M-101",
    sourceFile: "signals.json",
    widgetId: "w-temp",
  },
  {
    id: "v-export",
    severity: "info",
    message: "Export is draft only — no runtime deployment",
  },
];

export function getScreenById(id: string): GeneratedScreenSpec | undefined {
  return DEMO_GENERATED_SCREENS.find((s) => s.id === id);
}

export function getWidgetsForScreen(screenId: string): GeneratedWidgetBinding[] {
  const screen = getScreenById(screenId);
  if (!screen) return DEMO_WIDGET_BINDINGS;

  switch (screen.kind) {
    case "overview":
      return DEMO_WIDGET_BINDINGS.filter((w) =>
        ["w-map", "w-status", "w-calm", "w-evidence", "w-degraded"].includes(w.id),
      );
    case "line":
      return DEMO_WIDGET_BINDINGS.filter((w) =>
        ["w-map", "w-status", "w-mesh", "w-calm", "w-action"].includes(w.id),
      );
    case "asset":
      return DEMO_WIDGET_BINDINGS.filter((w) =>
        ["w-mesh", "w-status", "w-temp", "w-calm"].includes(w.id),
      );
    case "evidence":
      return DEMO_WIDGET_BINDINGS.filter((w) =>
        ["w-evidence", "w-dag", "w-calm"].includes(w.id),
      );
    case "dag":
      return DEMO_WIDGET_BINDINGS.filter((w) =>
        ["w-dag", "w-evidence", "w-role"].includes(w.id),
      );
    case "mobile":
      return DEMO_WIDGET_BINDINGS.filter((w) =>
        ["w-map", "w-status", "w-calm", "w-action"].includes(w.id),
      );
    default:
      return DEMO_WIDGET_BINDINGS;
  }
}

export function runHmiCompilerValidation(): {
  status: HmiValidationStatus;
  items: CompilerValidationItem[];
} {
  const items = [...DEMO_HMI_VALIDATION_ITEMS];
  const hasError = items.some((i) => i.severity === "error");
  const hasWarning = items.some((i) => i.severity === "warning");
  const status: HmiValidationStatus = hasError
    ? "error"
    : hasWarning
      ? "warning"
      : "valid";
  return { status, items };
}