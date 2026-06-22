export type PreviewCompileStatus = "idle" | "validating" | "invalid" | "compiled" | "failed";

export interface PreviewCompileIssue {
  id: string;
  severity: "error" | "warning" | "info";
  family: string;
  targetId: string | null;
  code: string;
  message: string;
  source: "draft_validation" | "local_compile" | "preview_projection";
}

export interface PreviewMap2DNode {
  id: string;
  label: string;
  asset_type: string;
  position: { x: number; y: number };
}

export interface PreviewMap2DEdge {
  id: string;
  from: string;
  to: string;
  kind: "power" | "signal" | "causal" | "unknown";
}

export interface PreviewMap3DNode {
  id: string;
  label: string;
  asset_type: string;
  position: { x: number; y: number; z: number };
}

export interface PreviewMap3DEdge {
  id: string;
  from: string;
  to: string;
  kind: "power" | "signal" | "causal" | "unknown";
}

export interface LocalHmiPreviewModel {
  plantId: string;
  generatedAt: string;
  map2d: {
    nodes: PreviewMap2DNode[];
    edges: PreviewMap2DEdge[];
  };
  map3d: {
    nodes: PreviewMap3DNode[];
    edges: PreviewMap3DEdge[];
  };
  summary: {
    assetCount: number;
    tagCount: number;
    alarmRuleCount: number;
    causalEdgeCount: number;
    actionCount: number;
    fallbackCoordinateCount: number;
  };
}

export interface PreviewCompileResult {
  status: PreviewCompileStatus;
  issues: PreviewCompileIssue[];
  model: LocalHmiPreviewModel | null;
}