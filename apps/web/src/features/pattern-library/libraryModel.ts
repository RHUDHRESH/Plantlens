/** Pure helpers for the pattern library: symbols, severity mapping, search and filters. */
import type { PatternLibrarySummary, PatternSummary } from "../../api/v2";
import type { SymbolKind } from "../../components/symbols";
import { symbolForAssetType } from "../../components/symbols";
import type { StatusKind } from "../../components/ui/primitives";

const COMPONENT_SYMBOL: Record<string, SymbolKind> = {
  battery: "battery",
  boiler: "boiler",
  compressor: "compressor",
  conveyor: "conveyor",
  dc_bus: "busbar",
  dc_motor: "dc_motor",
  fan: "fan",
  heat_exchanger: "heat_exchanger",
  induction_motor: "motor",
  pump: "pump_centrifugal",
  pv_mppt: "pv_array",
  tank: "tank",
  transformer: "transformer",
  valve: "valve_control",
  vfd: "vfd",
};

export function symbolForLibrary(lib: Pick<PatternLibrarySummary, "component_type" | "asset_type_aliases">): SymbolKind {
  const direct = COMPONENT_SYMBOL[lib.component_type];
  if (direct) return direct;
  return symbolForAssetType(lib.asset_type_aliases[0]);
}

/** Pattern severity → shape-coded status (warning = P3 square, critical = P1 triangle, info = P4 circle). */
export function severityStatus(severity: string): StatusKind {
  if (severity === "critical") return "critical";
  if (severity === "warning") return "medium";
  return "low";
}

export function severityLabel(severity: string): string {
  return severity === "critical" ? "Critical" : severity === "warning" ? "Warning" : "Info";
}

export function failureModeOf(patternId: string): string {
  const i = patternId.indexOf(".");
  return i === -1 ? patternId : patternId.slice(i + 1);
}

export function humanize(id: string): string {
  return id.replace(/[_.]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export interface PatternFilters {
  query: string;
  componentType: string | null;
  category: string | null;
  severity: string | null;
}

export interface PatternHit extends PatternSummary {
  component_type: string;
  display_name: string;
}

/** Tokenised AND search over title, failure mode, pattern id, category and required roles. */
export function searchPatterns(libraries: readonly PatternLibrarySummary[], f: PatternFilters): PatternHit[] {
  const tokens = f.query.toLowerCase().split(/\s+/).filter(Boolean);
  const out: PatternHit[] = [];
  for (const lib of libraries) {
    if (f.componentType && lib.component_type !== f.componentType) continue;
    for (const p of lib.patterns) {
      if (f.category && p.category !== f.category) continue;
      if (f.severity && p.severity !== f.severity) continue;
      if (tokens.length) {
        const hay = [
          p.title,
          p.pattern_id,
          failureModeOf(p.pattern_id).replace(/_/g, " "),
          p.category,
          lib.display_name,
          ...p.required_roles,
          ...p.required_roles.map((r) => r.replace(/_/g, " ")),
        ]
          .join(" ")
          .toLowerCase();
        if (!tokens.every((t) => hay.includes(t))) continue;
      }
      out.push({ ...p, component_type: lib.component_type, display_name: lib.display_name });
    }
  }
  return out;
}

export function categoriesOf(libraries: readonly PatternLibrarySummary[]): string[] {
  return [...new Set(libraries.flatMap((l) => l.patterns.map((p) => p.category)))].sort();
}

/** Short rail label: "AC induction motor (squirrel cage, 3-phase)" → "AC induction motor". */
export function shortName(displayName: string): string {
  return displayName.replace(/\s*\(.*\)\s*$/, "");
}
