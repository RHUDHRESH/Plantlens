export type Map3DPosition = {
  x: number;
  y: number;
  z: number;
};

export type Map3DRotation = {
  x: number;
  y: number;
  z: number;
};

export type Map3DPortKind =
  | "power_in"
  | "power_out"
  | "signal"
  | "airflow"
  | "cooling"
  | "mechanical"
  | "process"
  | "unknown";

export type Map3DPort = {
  id: string;
  kind: Map3DPortKind;
  label?: string;
  position: Map3DPosition;
};

export type Map3DCriticality = "low" | "medium" | "high";

export type Map3DNode = {
  id: string;
  label: string;
  asset_type: string;
  position: Map3DPosition;
  rotation?: Map3DRotation;
  scale?: number;
  model_key?: string;
  area_id?: string;
  parent_asset_id?: string | null;
  criticality?: Map3DCriticality;
  tags?: string[];
  alarms?: string[];
  status_binding: string;
  ports?: Map3DPort[];
};

export type Map3DEdgeType =
  | "power_flow"
  | "signal"
  | "causal"
  | "cooling"
  | "process"
  | "mechanical";

export type Map3DEdge = {
  id: string;
  from: string;
  to: string;
  type: Map3DEdgeType;
  from_port?: string;
  to_port?: string;
};

export type Map3DViewModel = {
  nodes: Map3DNode[];
  edges: Map3DEdge[];
};