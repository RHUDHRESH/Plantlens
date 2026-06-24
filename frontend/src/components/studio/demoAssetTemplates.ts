/**
 * Demo asset templates — scaffold model-draft data for Asset Studio.
 * Precomputed derivations only; no arbitrary eval.
 */
import type {
  AssetCategory,
  AssetTemplate,
  DerivedThreshold,
  ValidationItem,
  AssetValidationStatus,
} from "./studioTypes";

export const DEMO_ASSET_TEMPLATES: AssetTemplate[] = [
  {
    typeId: "motor.dc",
    label: "DC Motor",
    category: "motors",
    assetClass: "motor",
    geometryRef: "procedural:motor",
    description: "Brushed DC motor with thermal and current limits.",
    parameters: [
      { key: "rated_voltage", label: "Rated voltage", value: 12, unit: "V", visibility: "engineer", min: 1, max: 48 },
      { key: "rated_current", label: "Rated current", value: 4.2, unit: "A", visibility: "engineer", min: 0.1, max: 50 },
      { key: "rated_speed", label: "Rated speed", value: 3000, unit: "rpm", visibility: "engineer", min: 100, max: 10000 },
      { key: "stall_current", label: "Stall current", value: 18, unit: "A", visibility: "engineer", min: 1, max: 100 },
      { key: "thermal_tau", label: "Thermal tau", value: 180, unit: "sec", visibility: "engineer", min: 10, max: 600 },
      { key: "max_temp", label: "Max temp", value: 85, unit: "°C", visibility: "engineer", min: 40, max: 150 },
      { key: "type_id", label: "type_id", value: "motor.dc", visibility: "readonly" },
      { key: "class", label: "class", value: "motor", visibility: "readonly" },
      { key: "geometry_ref", label: "geometry_ref", value: "procedural:motor", visibility: "readonly" },
    ],
    signals: [
      { key: "current", label: "Current", unit: "A", status: "bound", source: "M-101.current" },
      { key: "rpm", label: "RPM", unit: "rpm", status: "bound", source: "M-101.rpm" },
      { key: "temp", label: "Temperature", unit: "°C", status: "optional", source: "M-101.temp" },
      { key: "vibration", label: "Vibration", unit: "mm/s", status: "bound", source: "M-101.vibration" },
    ],
    derivedRules: [
      {
        id: "current_warning",
        expression: "current.warning = rated_current * 1.15",
        description: "Warning threshold for overload detection",
        resultKey: "current.warning",
      },
      {
        id: "current_critical",
        expression: "current.critical = rated_current * 1.50",
        description: "Critical threshold for overload detection",
        resultKey: "current.critical",
      },
      {
        id: "temp_warning",
        expression: "temp.warning = max_temp * 0.80",
        description: "Thermal warning before max rated temp",
        resultKey: "temp.warning",
      },
    ],
    faultModes: [
      {
        id: "overload",
        label: "overload",
        severity: "critical",
        expectedSymptoms: ["current HIGH", "rpm FALLING"],
        contradictions: ["current NORMAL while rpm HIGH"],
      },
      {
        id: "bearing_wear",
        label: "bearing_wear",
        severity: "warning",
        expectedSymptoms: ["vibration spectral_peak", "rpm STABLE"],
      },
      {
        id: "loose_wire",
        label: "loose_wire",
        severity: "warning",
        expectedSymptoms: ["current INTERMITTENT", "vibration LOW"],
      },
    ],
  },
  {
    typeId: "motor.3ph",
    label: "3PH Motor",
    category: "motors",
    assetClass: "motor",
    geometryRef: "procedural:motor_3ph",
    parameters: [
      { key: "rated_voltage", label: "Rated voltage", value: 480, unit: "V", visibility: "engineer", min: 200, max: 690 },
      { key: "rated_current", label: "Rated current", value: 12.5, unit: "A", visibility: "engineer", min: 1, max: 200 },
      { key: "rated_speed", label: "Rated speed", value: 1750, unit: "rpm", visibility: "engineer", min: 500, max: 3600 },
      { key: "power_factor", label: "Power factor", value: 0.85, unit: "", visibility: "engineer", min: 0.5, max: 1 },
      { key: "max_temp", label: "Max temp", value: 120, unit: "°C", visibility: "engineer", min: 60, max: 180 },
      { key: "type_id", label: "type_id", value: "motor.3ph", visibility: "readonly" },
      { key: "class", label: "class", value: "motor", visibility: "readonly" },
      { key: "geometry_ref", label: "geometry_ref", value: "procedural:motor_3ph", visibility: "readonly" },
    ],
    signals: [
      { key: "current", label: "Current", unit: "A", status: "bound", source: "M-101.current" },
      { key: "rpm", label: "RPM", unit: "rpm", status: "bound", source: "M-101.rpm" },
      { key: "temp", label: "Temperature", unit: "°C", status: "optional" },
      { key: "vibration", label: "Vibration", unit: "mm/s", status: "bound" },
    ],
    derivedRules: [
      { id: "current_warning", expression: "current.warning = rated_current * 1.10", description: "3PH warning margin", resultKey: "current.warning" },
      { id: "current_critical", expression: "current.critical = rated_current * 1.40", description: "3PH critical margin", resultKey: "current.critical" },
      { id: "temp_warning", expression: "temp.warning = max_temp * 0.85", description: "Thermal warning", resultKey: "temp.warning" },
    ],
    faultModes: [
      { id: "overload", label: "overload", severity: "critical", expectedSymptoms: ["current HIGH", "rpm FALLING"] },
      { id: "phase_imbalance", label: "phase_imbalance", severity: "warning", expectedSymptoms: ["current UNBALANCED", "vibration ELEVATED"] },
      { id: "bearing_wear", label: "bearing_wear", severity: "warning", expectedSymptoms: ["vibration spectral_peak"] },
    ],
  },
  {
    typeId: "fan.axial",
    label: "Axial Fan",
    category: "air",
    assetClass: "fan",
    geometryRef: "procedural:fan_axial",
    parameters: [
      { key: "rated_flow", label: "Rated flow", value: 1200, unit: "CFM", visibility: "engineer", min: 100, max: 10000 },
      { key: "rated_speed", label: "Rated speed", value: 1450, unit: "rpm", visibility: "engineer", min: 200, max: 5000 },
      { key: "rated_power", label: "Rated power", value: 2.2, unit: "kW", visibility: "engineer", min: 0.1, max: 50 },
      { key: "blade_count", label: "Blade count", value: 6, unit: "", visibility: "engineer", min: 2, max: 12 },
      { key: "type_id", label: "type_id", value: "fan.axial", visibility: "readonly" },
      { key: "geometry_ref", label: "geometry_ref", value: "procedural:fan_axial", visibility: "readonly" },
    ],
    signals: [
      { key: "rpm", label: "RPM", unit: "rpm", status: "bound", source: "F-101.rpm" },
      { key: "flow", label: "Flow", unit: "CFM", status: "derived" },
      { key: "vibration", label: "Vibration", unit: "mm/s", status: "bound" },
      { key: "current", label: "Current", unit: "A", status: "bound" },
    ],
    derivedRules: [
      { id: "flow_warning", expression: "flow.warning = rated_flow * 0.70", description: "Low flow warning", resultKey: "flow.warning" },
      { id: "rpm_critical", expression: "rpm.critical = rated_speed * 1.10", description: "Overspeed critical", resultKey: "rpm.critical" },
    ],
    faultModes: [
      { id: "blade_damage", label: "blade_damage", severity: "warning", expectedSymptoms: ["vibration IMPULSE", "flow LOW"] },
      { id: "bearing_wear", label: "bearing_wear", severity: "warning", expectedSymptoms: ["vibration spectral_peak"] },
      { id: "motor_overload", label: "motor_overload", severity: "critical", expectedSymptoms: ["current HIGH", "rpm FALLING"] },
    ],
  },
  {
    typeId: "blower.centrifugal",
    label: "Centrifugal Blower",
    category: "air",
    assetClass: "blower",
    geometryRef: "procedural:blower_centrifugal",
    parameters: [
      { key: "rated_flow", label: "Rated flow", value: 800, unit: "CFM", visibility: "engineer", min: 50, max: 5000 },
      { key: "rated_pressure", label: "Rated pressure", value: 12, unit: "inH2O", visibility: "engineer", min: 1, max: 50 },
      { key: "rated_speed", label: "Rated speed", value: 3600, unit: "rpm", visibility: "engineer", min: 500, max: 6000 },
      { key: "rated_power", label: "Rated power", value: 5.5, unit: "kW", visibility: "engineer", min: 0.5, max: 100 },
      { key: "type_id", label: "type_id", value: "blower.centrifugal", visibility: "readonly" },
      { key: "geometry_ref", label: "geometry_ref", value: "procedural:blower_centrifugal", visibility: "readonly" },
    ],
    signals: [
      { key: "rpm", label: "RPM", unit: "rpm", status: "bound", source: "B-101.rpm" },
      { key: "pressure", label: "Pressure", unit: "inH2O", status: "bound" },
      { key: "flow", label: "Flow", unit: "CFM", status: "derived" },
      { key: "vibration", label: "Vibration", unit: "mm/s", status: "bound" },
    ],
    derivedRules: [
      { id: "pressure_warning", expression: "pressure.warning = rated_pressure * 0.75", description: "Low pressure warning", resultKey: "pressure.warning" },
      { id: "flow_warning", expression: "flow.warning = rated_flow * 0.65", description: "Low flow warning", resultKey: "flow.warning" },
    ],
    faultModes: [
      { id: "surge", label: "surge", severity: "critical", expectedSymptoms: ["pressure OSCILLATING", "flow UNSTABLE"] },
      { id: "impeller_wear", label: "impeller_wear", severity: "warning", expectedSymptoms: ["vibration ELEVATED", "flow LOW"] },
      { id: "seal_leak", label: "seal_leak", severity: "warning", expectedSymptoms: ["pressure LOW", "flow NORMAL"] },
    ],
  },
  {
    typeId: "power.dc_bus",
    label: "DC Bus",
    category: "power",
    assetClass: "power",
    geometryRef: "procedural:dc_bus",
    parameters: [
      { key: "nominal_voltage", label: "Nominal voltage", value: 24, unit: "V", visibility: "engineer", min: 12, max: 48 },
      { key: "max_current", label: "Max current", value: 40, unit: "A", visibility: "engineer", min: 5, max: 200 },
      { key: "ripple_limit", label: "Ripple limit", value: 2, unit: "%", visibility: "engineer", min: 0.5, max: 10 },
      { key: "type_id", label: "type_id", value: "power.dc_bus", visibility: "readonly" },
      { key: "geometry_ref", label: "geometry_ref", value: "procedural:dc_bus", visibility: "readonly" },
    ],
    signals: [
      { key: "voltage", label: "Voltage", unit: "V", status: "bound" },
      { key: "current", label: "Current", unit: "A", status: "bound" },
      { key: "ripple", label: "Ripple", unit: "%", status: "derived" },
    ],
    derivedRules: [
      { id: "voltage_warning", expression: "voltage.warning = nominal_voltage * 0.90", description: "Undervoltage warning", resultKey: "voltage.warning" },
      { id: "current_critical", expression: "current.critical = max_current * 0.95", description: "Near-limit critical", resultKey: "current.critical" },
    ],
    faultModes: [
      { id: "undervoltage", label: "undervoltage", severity: "warning", expectedSymptoms: ["voltage LOW"] },
      { id: "overcurrent", label: "overcurrent", severity: "critical", expectedSymptoms: ["current HIGH"] },
    ],
  },
  {
    typeId: "power.relay",
    label: "Relay",
    category: "power",
    assetClass: "relay",
    geometryRef: "procedural:relay",
    parameters: [
      { key: "coil_voltage", label: "Coil voltage", value: 24, unit: "V", visibility: "engineer", min: 5, max: 48 },
      { key: "contact_rating", label: "Contact rating", value: 10, unit: "A", visibility: "engineer", min: 1, max: 50 },
      { key: "type_id", label: "type_id", value: "power.relay", visibility: "readonly" },
      { key: "geometry_ref", label: "geometry_ref", value: "procedural:relay", visibility: "readonly" },
    ],
    signals: [
      { key: "coil_state", label: "Coil state", status: "bound" },
      { key: "contact_state", label: "Contact state", status: "bound" },
    ],
    derivedRules: [
      { id: "contact_warning", expression: "contact.warning = contact_rating * 0.80", description: "Contact load warning", resultKey: "contact.warning" },
    ],
    faultModes: [
      { id: "stuck_open", label: "stuck_open", severity: "critical", expectedSymptoms: ["coil ON", "contact OPEN"] },
      { id: "stuck_closed", label: "stuck_closed", severity: "critical", expectedSymptoms: ["coil OFF", "contact CLOSED"] },
    ],
  },
  {
    typeId: "sensor.current",
    label: "Current Sensor",
    category: "sensors",
    assetClass: "sensor",
    geometryRef: "procedural:sensor_current",
    parameters: [
      { key: "range_max", label: "Range max", value: 50, unit: "A", visibility: "engineer", min: 1, max: 500 },
      { key: "accuracy", label: "Accuracy", value: 0.5, unit: "%", visibility: "engineer", min: 0.1, max: 5 },
      { key: "response_time", label: "Response time", value: 10, unit: "ms", visibility: "engineer", min: 1, max: 100 },
      { key: "type_id", label: "type_id", value: "sensor.current", visibility: "readonly" },
      { key: "geometry_ref", label: "geometry_ref", value: "procedural:sensor_current", visibility: "readonly" },
    ],
    signals: [
      { key: "current", label: "Current", unit: "A", status: "bound" },
      { key: "quality", label: "Quality", status: "derived" },
    ],
    derivedRules: [
      { id: "range_warning", expression: "current.warning = range_max * 0.90", description: "Near-range warning", resultKey: "current.warning" },
    ],
    faultModes: [
      { id: "saturation", label: "saturation", severity: "warning", expectedSymptoms: ["current AT_LIMIT", "quality BAD"] },
      { id: "open_circuit", label: "open_circuit", severity: "critical", expectedSymptoms: ["current ZERO", "load ACTIVE"] },
    ],
  },
  {
    typeId: "sensor.temp",
    label: "Temp Sensor",
    category: "sensors",
    assetClass: "sensor",
    geometryRef: "procedural:sensor_temp",
    parameters: [
      { key: "range_min", label: "Range min", value: -40, unit: "°C", visibility: "engineer", min: -100, max: 0 },
      { key: "range_max", label: "Range max", value: 150, unit: "°C", visibility: "engineer", min: 50, max: 300 },
      { key: "accuracy", label: "Accuracy", value: 1.0, unit: "°C", visibility: "engineer", min: 0.1, max: 5 },
      { key: "type_id", label: "type_id", value: "sensor.temp", visibility: "readonly" },
      { key: "geometry_ref", label: "geometry_ref", value: "procedural:sensor_temp", visibility: "readonly" },
    ],
    signals: [
      { key: "temp", label: "Temperature", unit: "°C", status: "optional" },
      { key: "quality", label: "Quality", status: "derived" },
    ],
    derivedRules: [
      { id: "temp_warning", expression: "temp.warning = range_max * 0.80", description: "High temp warning", resultKey: "temp.warning" },
    ],
    faultModes: [
      { id: "drift", label: "drift", severity: "warning", expectedSymptoms: ["temp SLOW_RISE", "load STABLE"] },
      { id: "open_wire", label: "open_wire", severity: "critical", expectedSymptoms: ["temp OUT_OF_RANGE", "quality BAD"] },
    ],
  },
  {
    typeId: "sensor.vibration",
    label: "Vibration Sensor",
    category: "sensors",
    assetClass: "sensor",
    geometryRef: "procedural:sensor_vibration",
    parameters: [
      { key: "range_max", label: "Range max", value: 50, unit: "mm/s", visibility: "engineer", min: 5, max: 200 },
      { key: "band_low", label: "Band low", value: 10, unit: "Hz", visibility: "engineer", min: 1, max: 100 },
      { key: "band_high", label: "Band high", value: 1000, unit: "Hz", visibility: "engineer", min: 100, max: 10000 },
      { key: "type_id", label: "type_id", value: "sensor.vibration", visibility: "readonly" },
      { key: "geometry_ref", label: "geometry_ref", value: "procedural:sensor_vibration", visibility: "readonly" },
    ],
    signals: [
      { key: "vibration", label: "Vibration", unit: "mm/s", status: "bound" },
      { key: "spectral_peak", label: "Spectral peak", unit: "Hz", status: "derived" },
    ],
    derivedRules: [
      { id: "vib_warning", expression: "vibration.warning = range_max * 0.60", description: "Elevated vibration warning", resultKey: "vibration.warning" },
    ],
    faultModes: [
      { id: "bearing_defect", label: "bearing_defect", severity: "warning", expectedSymptoms: ["spectral_peak AT_BPFO"] },
      { id: "imbalance", label: "imbalance", severity: "warning", expectedSymptoms: ["vibration AT_1X", "rpm STABLE"] },
    ],
  },
  {
    typeId: "valve.solenoid",
    label: "Solenoid Valve",
    category: "valves",
    assetClass: "valve",
    geometryRef: "procedural:valve_solenoid",
    parameters: [
      { key: "coil_voltage", label: "Coil voltage", value: 24, unit: "V", visibility: "engineer", min: 5, max: 48 },
      { key: "flow_coeff", label: "Flow coefficient", value: 2.5, unit: "Cv", visibility: "engineer", min: 0.1, max: 20 },
      { key: "response_time", label: "Response time", value: 50, unit: "ms", visibility: "engineer", min: 10, max: 500 },
      { key: "type_id", label: "type_id", value: "valve.solenoid", visibility: "readonly" },
      { key: "geometry_ref", label: "geometry_ref", value: "procedural:valve_solenoid", visibility: "readonly" },
    ],
    signals: [
      { key: "position", label: "Position", status: "bound" },
      { key: "flow", label: "Flow", unit: "GPM", status: "derived" },
    ],
    derivedRules: [
      { id: "flow_warning", expression: "flow.warning = flow_coeff * 0.50", description: "Restricted flow warning", resultKey: "flow.warning" },
    ],
    faultModes: [
      { id: "stuck_closed", label: "stuck_closed", severity: "critical", expectedSymptoms: ["coil ON", "flow ZERO"] },
      { id: "stuck_open", label: "stuck_open", severity: "critical", expectedSymptoms: ["coil OFF", "flow HIGH"] },
    ],
  },
];

export const ASSET_CATEGORIES: AssetCategory[] = [
  "motors",
  "air",
  "power",
  "sensors",
  "valves",
];

export function getAssetTemplate(typeId: string): AssetTemplate | undefined {
  return DEMO_ASSET_TEMPLATES.find((t) => t.typeId === typeId);
}

export function getDefaultTemplateId(): string {
  return "motor.dc";
}

export function resolveTemplateForInstance(instanceId: string | null): string {
  if (!instanceId) return getDefaultTemplateId();
  const map: Record<string, string> = {
    "M-101": "motor.dc",
    "F-101": "fan.axial",
    "B-101": "blower.centrifugal",
  };
  return map[instanceId] ?? getDefaultTemplateId();
}

function num(params: Record<string, number | string>, key: string, fallback = 0): number {
  const v = params[key];
  if (typeof v === "number") return v;
  const parsed = parseFloat(String(v));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fmt(value: number, decimals = 2, unit?: string): string {
  const s = value.toFixed(decimals).replace(/\.?0+$/, "");
  return unit ? `${s} ${unit}` : s;
}

/** Precomputed derived results — no eval. */
export function computeDerivedResults(
  template: AssetTemplate,
  params: Record<string, number | string>,
): Record<string, string> {
  const results: Record<string, string> = {};

  for (const rule of template.derivedRules) {
    switch (rule.id) {
      case "current_warning":
        results[rule.resultKey] = fmt(num(params, "rated_current") * (template.typeId === "motor.3ph" ? 1.1 : 1.15), 2, "A");
        break;
      case "current_critical":
        if (params.max_current !== undefined) {
          results[rule.resultKey] = fmt(num(params, "max_current") * 0.95, 1, "A");
        } else {
          results[rule.resultKey] = fmt(
            num(params, "rated_current") * (template.typeId === "motor.3ph" ? 1.4 : 1.5),
            2,
            "A",
          );
        }
        break;
      case "temp_warning":
        results[rule.resultKey] = fmt(num(params, "max_temp") * (template.typeId === "motor.3ph" ? 0.85 : 0.8), 1, "°C");
        break;
      case "flow_warning":
        results[rule.resultKey] = fmt(
          num(params, "rated_flow") * (template.typeId === "blower.centrifugal" ? 0.65 : 0.7),
          0,
          "CFM",
        );
        break;
      case "rpm_critical":
        results[rule.resultKey] = fmt(num(params, "rated_speed") * 1.1, 0, "rpm");
        break;
      case "pressure_warning":
        results[rule.resultKey] = fmt(num(params, "rated_pressure") * 0.75, 1, "inH2O");
        break;
      case "voltage_warning":
        results[rule.resultKey] = fmt(num(params, "nominal_voltage") * 0.9, 1, "V");
        break;

      case "contact_warning":
        results[rule.resultKey] = fmt(num(params, "contact_rating") * 0.8, 1, "A");
        break;
      case "range_warning":
        results[rule.resultKey] = fmt(num(params, "range_max") * 0.9, 1, "A");
        break;
      case "vib_warning":
        results[rule.resultKey] = fmt(num(params, "range_max") * 0.6, 1, "mm/s");
        break;
      default:
        results[rule.resultKey] = "—";
    }
  }

  return results;
}

export function computeDerivedThresholds(
  template: AssetTemplate,
  params: Record<string, number | string>,
): DerivedThreshold[] {
  const results = computeDerivedResults(template, params);
  return template.derivedRules.map((rule) => ({
    key: rule.resultKey,
    label: rule.resultKey,
    value: results[rule.resultKey] ?? "—",
  }));
}

export function buildParameterMap(template: AssetTemplate): Record<string, number | string> {
  const map: Record<string, number | string> = {};
  for (const p of template.parameters) {
    map[p.key] = p.value;
  }
  return map;
}

export function validateAssetDraft(
  template: AssetTemplate,
  params: Record<string, number | string>,
): { status: AssetValidationStatus; items: ValidationItem[] } {
  const items: ValidationItem[] = [];
  let hasError = false;
  let hasWarning = false;

  const engineerParams = template.parameters.filter((p) => p.visibility === "engineer");
  let paramsValid = true;
  for (const p of engineerParams) {
    const raw = params[p.key];
    const value = typeof raw === "number" ? raw : parseFloat(String(raw));
    if (!Number.isFinite(value)) {
      paramsValid = false;
      hasError = true;
      break;
    }
    if (p.min !== undefined && value < p.min) {
      paramsValid = false;
      hasError = true;
      break;
    }
    if (p.max !== undefined && value > p.max) {
      paramsValid = false;
      hasError = true;
      break;
    }
  }
  items.push({
    id: "params",
    label: "Parameters valid",
    level: paramsValid ? "valid" : "error",
    detail: paramsValid ? undefined : "One or more parameters out of range",
  });

  const missingSignals = template.signals.filter((s) => s.status === "missing");
  const optionalSignals = template.signals.filter((s) => s.status === "optional");
  const boundSignals = template.signals.filter(
    (s) => s.status === "bound" || s.status === "derived",
  );
  const signalsBound = missingSignals.length === 0;
  items.push({
    id: "signals",
    label: "Signals bound",
    level: signalsBound ? "valid" : "error",
    detail: signalsBound
      ? `${boundSignals.length} bound/derived`
      : `${missingSignals.length} missing`,
  });
  if (!signalsBound) hasError = true;
  if (optionalSignals.length > 0) {
    items.push({
      id: "temp_optional",
      label: "Temp optional",
      level: "warning",
      detail: `${optionalSignals.map((s) => s.label).join(", ")} not required`,
    });
    hasWarning = true;
  }

  const geometryBound = Boolean(template.geometryRef);
  items.push({
    id: "geometry",
    label: "Geometry bound",
    level: geometryBound ? "valid" : "error",
    detail: template.geometryRef,
  });
  if (!geometryBound) hasError = true;

  const rulesValid = template.derivedRules.length > 0;
  items.push({
    id: "rules",
    label: "Derived rules valid",
    level: rulesValid ? "valid" : "warning",
    detail: `${template.derivedRules.length} rules`,
  });
  if (!rulesValid) hasWarning = true;

  const faultsPresent = template.faultModes.length > 0;
  items.push({
    id: "faults",
    label: "Fault modes present",
    level: faultsPresent ? "valid" : "warning",
    detail: `${template.faultModes.length} modes`,
  });
  if (!faultsPresent) hasWarning = true;

  let status: AssetValidationStatus = "valid";
  if (hasError) status = "error";
  else if (hasWarning) status = "warning";

  return { status, items };
}

export function filterTemplatesByQuery(
  templates: AssetTemplate[],
  query: string,
): AssetTemplate[] {
  const q = query.trim().toLowerCase();
  if (!q) return templates;
  return templates.filter(
    (t) =>
      t.label.toLowerCase().includes(q) ||
      t.typeId.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q),
  );
}