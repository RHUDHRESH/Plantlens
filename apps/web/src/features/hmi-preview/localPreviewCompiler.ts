import type { StudioDraftBundle, StudioDraftIssue } from "../studio-forms/studioDraftTypes";
import {
  selectActions,
  selectAlarmRules,
  selectAssets,
  selectCausalEdges,
  selectTags,
} from "../studio-forms/studioSelectors";
import type {
  LocalHmiPreviewModel,
  PreviewCompileIssue,
  PreviewCompileResult,
  PreviewMap2DEdge,
  PreviewMap2DNode,
  PreviewMap3DEdge,
  PreviewMap3DNode,
} from "./previewTypes";

const GRID_SPACING_2D = 220;
const GRID_SPACING_3D = 2;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === "string" ? v : "";
}

function readCoords2D(asset: Record<string, unknown>): { x: number; y: number } | null {
  const coords = asRecord(asset.coords_2d);
  if (!coords) return null;
  const x = coords.x;
  const y = coords.y;
  if (typeof x === "number" && typeof y === "number") return { x, y };
  return null;
}

function readCoords3D(asset: Record<string, unknown>): { x: number; y: number; z: number } | null {
  const coords = asRecord(asset.coords_3d);
  if (!coords) return null;
  const x = coords.x;
  const y = coords.y;
  const z = coords.z;
  if (typeof x === "number" && typeof y === "number" && typeof z === "number") {
    return { x, y, z };
  }
  return null;
}

function connectionKind(kind: string): PreviewMap2DEdge["kind"] {
  if (kind === "power") return "power";
  if (kind === "signal") return "signal";
  if (kind === "causal") return "causal";
  return "unknown";
}

export function buildFallback2DPosition(index: number): { x: number; y: number } {
  const col = index % 4;
  const row = Math.floor(index / 4);
  return { x: col * GRID_SPACING_2D, y: row * GRID_SPACING_2D };
}

export function buildFallback3DPosition(index: number): { x: number; y: number; z: number } {
  const col = index % 4;
  const row = Math.floor(index / 4);
  return { x: col * GRID_SPACING_3D, y: 0, z: row * GRID_SPACING_3D };
}

export function extractPreviewAssets(bundle: StudioDraftBundle) {
  return selectAssets(bundle);
}

export function extractPreviewTags(bundle: StudioDraftBundle) {
  return selectTags(bundle);
}

export function extractPreviewAlarmRules(bundle: StudioDraftBundle) {
  return selectAlarmRules(bundle);
}

export function extractPreviewCausalEdges(bundle: StudioDraftBundle) {
  return selectCausalEdges(bundle);
}

export function extractPreviewActions(bundle: StudioDraftBundle) {
  return selectActions(bundle);
}

export function normalizePreviewIssue(issue: StudioDraftIssue): PreviewCompileIssue {
  return {
    id: issue.id,
    severity: issue.severity,
    family: issue.family,
    targetId: issue.targetId,
    code: issue.code,
    message: issue.message,
    source: "draft_validation",
  };
}

function compileIssue(
  severity: PreviewCompileIssue["severity"],
  family: string,
  targetId: string | null,
  code: string,
  message: string,
  source: PreviewCompileIssue["source"],
): PreviewCompileIssue {
  return {
    id: `${source}:${family}:${targetId ?? "global"}:${code}`,
    severity,
    family,
    targetId,
    code,
    message,
    source,
  };
}

export function compileLocalHmiPreview({
  bundle,
  draftIssues,
  now = () => new Date().toISOString(),
}: {
  bundle: StudioDraftBundle;
  draftIssues: StudioDraftIssue[];
  now?: () => string;
}): PreviewCompileResult {
  const validationIssues = draftIssues.map(normalizePreviewIssue);
  if (draftIssues.some((i) => i.severity === "error")) {
    return { status: "invalid", issues: validationIssues, model: null };
  }

  const issues: PreviewCompileIssue[] = [...validationIssues];
  const plant = asRecord(bundle.plant);
  if (!plant) {
    return {
      status: "failed",
      issues: [
        ...issues,
        compileIssue("error", "plant", null, "MISSING_PLANT", "Plant contract missing.", "local_compile"),
      ],
      model: null,
    };
  }

  const assets = extractPreviewAssets(bundle).sort((a, b) =>
    readString(a, "id").localeCompare(readString(b, "id")),
  );
  let fallbackCoordinateCount = 0;

  const map2dNodes: PreviewMap2DNode[] = assets.map((asset, index) => {
    const id = readString(asset, "id");
    const assetType = readString(asset, "type");
    if (!assetType) {
      issues.push(
        compileIssue(
          "warning",
          "plant",
          id,
          "UNKNOWN_ASSET_TYPE",
          `Asset ${id} has no authored type — preview uses "unknown".`,
          "preview_projection",
        ),
      );
    }
    const coords = readCoords2D(asset);
    if (!coords) {
      fallbackCoordinateCount += 1;
      issues.push(
        compileIssue(
          "warning",
          "plant",
          id,
          "FALLBACK_2D_COORDS",
          `Asset ${id} uses deterministic fallback 2D coordinates — not authored truth.`,
          "preview_projection",
        ),
      );
    }
    return {
      id,
      label: readString(asset, "display_name") || id,
      asset_type: assetType || "unknown",
      position: coords ?? buildFallback2DPosition(index),
    };
  });

  const map3dNodes: PreviewMap3DNode[] = assets.map((asset, index) => {
    const id = readString(asset, "id");
    const assetType = readString(asset, "type");
    const coords = readCoords3D(asset);
    if (!coords) {
      issues.push(
        compileIssue(
          "warning",
          "plant",
          id,
          "FALLBACK_3D_COORDS",
          `Asset ${id} uses deterministic fallback 3D coordinates — not authored truth.`,
          "preview_projection",
        ),
      );
    }
    return {
      id,
      label: readString(asset, "display_name") || id,
      asset_type: assetType || "unknown",
      position: coords ?? buildFallback3DPosition(index),
    };
  });

  const edgeMap = new Map<string, PreviewMap2DEdge>();

  for (const raw of asArray(plant.connections)) {
    const conn = asRecord(raw);
    if (!conn) continue;
    const from = readString(conn, "from");
    const to = readString(conn, "to");
    if (!from || !to) continue;
    const rawKind = readString(conn, "kind");
    const kind = connectionKind(rawKind);
    if (rawKind && kind === "unknown") {
      issues.push(
        compileIssue(
          "warning",
          "plant",
          `${from}:${to}`,
          "UNKNOWN_CONNECTION_KIND",
          `Connection ${from} → ${to} has unrecognized kind "${rawKind}" — preview edge marked unknown.`,
          "preview_projection",
        ),
      );
    }
    const id = `conn:${from}:${to}`;
    edgeMap.set(id, { id, from, to, kind });
  }

  for (const edge of extractPreviewCausalEdges(bundle)) {
    const id = readString(edge, "id") || `causal:${readString(edge, "from")}:${readString(edge, "to")}`;
    const from = readString(edge, "from");
    const to = readString(edge, "to");
    if (!from || !to) continue;
    edgeMap.set(id, { id, from, to, kind: "causal" });
  }

  const map2dEdges = [...edgeMap.values()].sort((a, b) => a.id.localeCompare(b.id));
  const map3dEdges: PreviewMap3DEdge[] = map2dEdges.map((e) => ({ ...e }));

  const plantId = readString(plant, "plant_id") || "unknown_plant";
  const model: LocalHmiPreviewModel = {
    plantId,
    generatedAt: now(),
    map2d: { nodes: map2dNodes, edges: map2dEdges },
    map3d: { nodes: map3dNodes, edges: map3dEdges },
    summary: {
      assetCount: assets.length,
      tagCount: extractPreviewTags(bundle).length,
      alarmRuleCount: extractPreviewAlarmRules(bundle).length,
      causalEdgeCount: extractPreviewCausalEdges(bundle).length,
      actionCount: extractPreviewActions(bundle).length,
      fallbackCoordinateCount,
    },
  };

  issues.push(
    compileIssue(
      "info",
      "preview",
      null,
      "LOCAL_PREVIEW_ONLY",
      "Preview is local and read-only. Runtime is unchanged.",
      "local_compile",
    ),
  );

  return { status: "compiled", issues, model };
}