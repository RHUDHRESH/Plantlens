import { SAFETY_MEDIA, defaultMatrix } from "./media";
import type { BuiltinRuleKey, ConnectionRuleSet, CustomRule, SideCondition } from "./types";

/**
 * Sensible defaults: outputs may feed many (a supply feeds loads, a shaft drives a coupling and a
 * tachometer tap), every input takes exactly one feed, comm buses and mounts are unlimited, and
 * closed loops on power are denied unless flagged.
 */
export function defaultRuleSet(): ConnectionRuleSet {
  return {
    schema_version: 1,
    builtins: {
      medium_compatibility: { enabled: true, check_quantity: true, matrix: defaultMatrix() },
      direction: { enabled: true, severity: "deny" },
      max_connections: {
        enabled: true,
        severity: "deny",
        default: { fan_out: null, fan_in: 1 },
        limits: {
          serial_comm: { fan_out: null, fan_in: null },
          ethernet: { fan_out: null, fan_in: null },
          mounting: { fan_out: null, fan_in: null },
        },
      },
      nominal_range: { enabled: true, severity: "warn", safety_media: [...SAFETY_MEDIA] },
      self_connection: { enabled: true, allow_same_node: false },
      duplicate_edge: { enabled: true },
      cycle_policy: { enabled: true, default: "allow", per_medium: { dc_power: "deny", ac_power: "deny" } },
      required_ports: { enabled: true, severity: "warn" },
      tag_compatibility: { enabled: true, severity: "warn" },
    },
    custom: [],
  };
}

export const BUILTIN_META: Record<BuiltinRuleKey, { title: string; description: string; overridable: boolean; duringDrag: boolean }> = {
  medium_compatibility: {
    title: "Medium compatibility",
    description: "Which media may connect (matrix) and whether quantity kinds must agree.",
    overridable: true,
    duringDrag: true,
  },
  direction: {
    title: "Direction",
    description: "Outputs drive inputs. Bidirectional ports connect either way.",
    overridable: true,
    duringDrag: true,
  },
  max_connections: {
    title: "Connections per port",
    description: "Fan-out (outputs) and fan-in (inputs) limits, per medium.",
    overridable: true,
    duringDrag: true,
  },
  nominal_range: {
    title: "Nominal range overlap",
    description: "Voltage/current ranges of both ports must overlap. Safety media always deny.",
    overridable: true,
    duringDrag: true,
  },
  self_connection: {
    title: "No self-connection",
    description: "A component cannot connect to itself.",
    overridable: false,
    duringDrag: true,
  },
  duplicate_edge: {
    title: "No duplicate connection",
    description: "The same two ports can be connected once.",
    overridable: false,
    duringDrag: true,
  },
  cycle_policy: {
    title: "Closed loops",
    description: "Per-medium policy for connections that close a loop. Flag intentional loops on the edge.",
    overridable: true,
    duringDrag: true,
  },
  required_ports: {
    title: "Required ports connected",
    description: "Reported in validation, never while dragging.",
    overridable: false,
    duringDrag: false,
  },
  tag_compatibility: {
    title: "Compatibility tags",
    description: "Physical ports with disjoint compatibility tags need an adapter.",
    overridable: true,
    duringDrag: true,
  },
};

export function emptySide(): SideCondition {
  return { categories: [], component_type_ids: [], directions: [], tags_any: [], port_ids: [] };
}

export function newCustomRule(existing: readonly CustomRule[]): CustomRule {
  let n = existing.length + 1;
  const ids = new Set(existing.map((r) => r.id));
  while (ids.has(`rule-${n}`)) n += 1;
  const maxPriority = existing.reduce((m, r) => Math.max(m, r.priority), 0);
  return {
    id: `rule-${n}`,
    name: `Custom rule ${n}`,
    enabled: true,
    priority: existing.length ? maxPriority + 10 : 10,
    source: emptySide(),
    target: emptySide(),
    media: [],
    action: "warn",
    message: "Review this connection.",
    fix: "",
  };
}
