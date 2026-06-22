import type { LocalHmiPreviewModel } from "./previewTypes";

export interface PreviewDiffItem {
  id: string;
  kind: "asset" | "edge" | "tag" | "alarm_rule" | "causal_edge" | "action";
  change: "added" | "removed" | "changed" | "unchanged";
  label: string;
  detail: string;
}

const CHANGE_ORDER = { added: 0, removed: 1, changed: 2, unchanged: 3 } as const;
const KIND_ORDER = { asset: 0, edge: 1, tag: 2, alarm_rule: 3, causal_edge: 4, action: 5 } as const;

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

function extractCompiledNodes(compiledBundle: unknown): Array<{ id: string; label: string }> {
  const root = asRecord(compiledBundle);
  const hmi = asRecord(root?.hmi_view_model);
  const map2d = asRecord(hmi?.map_2d);
  return asArray(map2d?.nodes)
    .map((n) => asRecord(n))
    .filter((n): n is Record<string, unknown> => n != null && typeof n.id === "string")
    .map((n) => ({ id: readString(n, "id"), label: readString(n, "label") || readString(n, "id") }));
}

function extractCompiledEdges(compiledBundle: unknown): Array<{ id: string; from: string; to: string }> {
  const root = asRecord(compiledBundle);
  const hmi = asRecord(root?.hmi_view_model);
  const map2d = asRecord(hmi?.map_2d);
  return asArray(map2d?.edges)
    .map((e) => asRecord(e))
    .filter((e): e is Record<string, unknown> => e != null && typeof e.id === "string")
    .map((e) => ({
      id: readString(e, "id"),
      from: readString(e, "from"),
      to: readString(e, "to"),
    }));
}

function sortDiff(items: PreviewDiffItem[]): PreviewDiffItem[] {
  return [...items].sort((a, b) => {
    const change = CHANGE_ORDER[a.change] - CHANGE_ORDER[b.change];
    if (change !== 0) return change;
    const kind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (kind !== 0) return kind;
    return a.id.localeCompare(b.id);
  });
}

export function diffPreviewAgainstCompiled({
  preview,
  compiledBundle,
}: {
  preview: LocalHmiPreviewModel | null;
  compiledBundle?: unknown;
}): PreviewDiffItem[] {
  if (!preview || !compiledBundle) return [];

  const previewNodes = new Map(preview.map2d.nodes.map((n) => [n.id, n]));
  const compiledNodes = extractCompiledNodes(compiledBundle);
  const compiledNodeMap = new Map(compiledNodes.map((n) => [n.id, n]));

  const items: PreviewDiffItem[] = [];

  for (const node of preview.map2d.nodes) {
    const compiled = compiledNodeMap.get(node.id);
    if (!compiled) {
      items.push({
        id: node.id,
        kind: "asset",
        change: "added",
        label: node.label,
        detail: "Present in local preview, not in compiled HMI map.",
      });
    } else if (compiled.label !== node.label) {
      items.push({
        id: node.id,
        kind: "asset",
        change: "changed",
        label: node.label,
        detail: `Label differs: preview "${node.label}" vs compiled "${compiled.label}".`,
      });
    } else {
      items.push({
        id: node.id,
        kind: "asset",
        change: "unchanged",
        label: node.label,
        detail: "Asset ID present in both preview and compiled HMI.",
      });
    }
  }

  for (const compiled of compiledNodes) {
    if (!previewNodes.has(compiled.id)) {
      items.push({
        id: compiled.id,
        kind: "asset",
        change: "removed",
        label: compiled.label,
        detail: "Present in compiled HMI, not in local preview.",
      });
    }
  }

  const previewEdges = new Map(preview.map2d.edges.map((e) => [e.id, e]));
  const compiledEdges = extractCompiledEdges(compiledBundle);
  const compiledEdgeMap = new Map(compiledEdges.map((e) => [e.id, e]));

  for (const edge of preview.map2d.edges) {
    const compiled = compiledEdgeMap.get(edge.id);
    if (!compiled) {
      items.push({
        id: edge.id,
        kind: "edge",
        change: "added",
        label: `${edge.from} → ${edge.to}`,
        detail: "Edge in local preview only.",
      });
    } else if (compiled.from !== edge.from || compiled.to !== edge.to) {
      items.push({
        id: edge.id,
        kind: "edge",
        change: "changed",
        label: `${edge.from} → ${edge.to}`,
        detail: `Endpoints differ from compiled (${compiled.from} → ${compiled.to}).`,
      });
    } else {
      items.push({
        id: edge.id,
        kind: "edge",
        change: "unchanged",
        label: `${edge.from} → ${edge.to}`,
        detail: "Edge matches compiled HMI.",
      });
    }
  }

  for (const compiled of compiledEdges) {
    if (!previewEdges.has(compiled.id)) {
      items.push({
        id: compiled.id,
        kind: "edge",
        change: "removed",
        label: `${compiled.from} → ${compiled.to}`,
        detail: "Edge in compiled HMI only.",
      });
    }
  }

  if (preview.summary.tagCount !== 0) {
    items.push({
      id: "summary:tags",
      kind: "tag",
      change: "unchanged",
      label: `${preview.summary.tagCount} tags`,
      detail: "Tag count from draft bundle (not compared to compiled map).",
    });
  }

  return sortDiff(items);
}