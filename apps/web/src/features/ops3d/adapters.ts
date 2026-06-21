import type {
  Map3DCriticality,
  Map3DEdge,
  Map3DEdgeType,
  Map3DNode,
  Map3DPort,
  Map3DPortKind,
  Map3DPosition,
  Map3DRotation,
  Map3DViewModel,
} from "./map3dTypes";

const EDGE_TYPES: ReadonlySet<Map3DEdgeType> = new Set([
  "power_flow",
  "signal",
  "causal",
  "cooling",
  "process",
  "mechanical",
]);

const PORT_KINDS: ReadonlySet<Map3DPortKind> = new Set([
  "power_in",
  "power_out",
  "signal",
  "airflow",
  "cooling",
  "mechanical",
  "process",
  "unknown",
]);

const CRITICALITIES: ReadonlySet<Map3DCriticality> = new Set(["low", "medium", "high"]);

const ZERO_POSITION: Map3DPosition = { x: 0, y: 0, z: 0 };

function normalizePosition(value: unknown): Map3DPosition {
  if (!value || typeof value !== "object") return ZERO_POSITION;
  const position = value as Record<string, unknown>;
  return {
    x: typeof position.x === "number" ? position.x : 0,
    y: typeof position.y === "number" ? position.y : 0,
    z: typeof position.z === "number" ? position.z : 0,
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function normalizeRotation(value: unknown): Map3DRotation | undefined {
  if (!value || typeof value !== "object") return undefined;
  const rotation = value as Record<string, unknown>;
  return {
    x: typeof rotation.x === "number" ? rotation.x : 0,
    y: typeof rotation.y === "number" ? rotation.y : 0,
    z: typeof rotation.z === "number" ? rotation.z : 0,
  };
}

function normalizePorts(value: unknown): Map3DPort[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ports = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const port = item as Record<string, unknown>;
      if (typeof port.id !== "string") return null;
      const kind = typeof port.kind === "string" && PORT_KINDS.has(port.kind as Map3DPortKind)
        ? (port.kind as Map3DPortKind)
        : "unknown";
      return {
        id: port.id,
        kind,
        position: normalizePosition(port.position),
        ...(typeof port.label === "string" ? { label: port.label } : {}),
      };
    })
    .filter((port): port is Map3DPort => port !== null);
  return ports.length ? ports : undefined;
}

export function normalizeMap3DNode(raw: unknown): Map3DNode | null {
  if (!raw || typeof raw !== "object") return null;
  const node = raw as Record<string, unknown>;
  if (typeof node.id !== "string") return null;

  const id = node.id;
  const criticality =
    typeof node.criticality === "string" && CRITICALITIES.has(node.criticality as Map3DCriticality)
      ? (node.criticality as Map3DCriticality)
      : undefined;
  const rotation = normalizeRotation(node.rotation);
  const ports = normalizePorts(node.ports);

  const normalized: Map3DNode = {
    id,
    label: typeof node.label === "string" ? node.label : id,
    asset_type: typeof node.asset_type === "string" ? node.asset_type : "unknown",
    position: normalizePosition(node.position),
    status_binding:
      typeof node.status_binding === "string" ? node.status_binding : `asset_status.${id}`,
    tags: normalizeStringArray(node.tags),
    alarms: normalizeStringArray(node.alarms),
  };

  if (typeof node.model_key === "string") normalized.model_key = node.model_key;
  if (typeof node.area_id === "string") normalized.area_id = node.area_id;
  if (node.parent_asset_id === null || typeof node.parent_asset_id === "string") {
    normalized.parent_asset_id = node.parent_asset_id as string | null;
  }
  if (criticality) normalized.criticality = criticality;
  if (typeof node.scale === "number") normalized.scale = node.scale;
  if (rotation) normalized.rotation = rotation;
  if (ports) normalized.ports = ports;

  return normalized;
}

export function normalizeMap3DEdge(raw: unknown): Map3DEdge | null {
  if (!raw || typeof raw !== "object") return null;
  const edge = raw as Record<string, unknown>;
  if (
    typeof edge.id !== "string" ||
    typeof edge.from !== "string" ||
    typeof edge.to !== "string" ||
    typeof edge.type !== "string" ||
    !EDGE_TYPES.has(edge.type as Map3DEdgeType)
  ) {
    return null;
  }

  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    type: edge.type as Map3DEdgeType,
    ...(typeof edge.from_port === "string" ? { from_port: edge.from_port } : {}),
    ...(typeof edge.to_port === "string" ? { to_port: edge.to_port } : {}),
  };
}

export function adaptMap3DViewModel(raw: { nodes?: unknown[]; edges?: unknown[] } | undefined): Map3DViewModel {
  return {
    nodes: (raw?.nodes ?? [])
      .map(normalizeMap3DNode)
      .filter((node): node is Map3DNode => node !== null),
    edges: (raw?.edges ?? [])
      .map(normalizeMap3DEdge)
      .filter((edge): edge is Map3DEdge => edge !== null),
  };
}