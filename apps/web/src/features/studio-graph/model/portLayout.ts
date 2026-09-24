/**
 * Deterministic node geometry: inputs on the left, outputs on the right, bidirectional ports on the
 * shorter side (one handle that both sources and targets). Handle y-offsets are computed here so
 * edges, guides and align/distribute agree with what the node renders.
 */
import type { Port } from "../componentLibraryTypes";

export const NODE_WIDTH = 256;
export const NODE_HEADER = 56;
export const PORT_ROW = 24;
export const NODE_PADDING_BOTTOM = 8;

export type Side = "left" | "right";

export interface PlacedPort {
  port: Port;
  side: Side;
  row: number;
  /** Handle centre, px from the node's top edge. */
  offsetY: number;
  /** No port on the opposite side of this row: the label may use the full width. */
  fullWidth: boolean;
}

export interface NodeLayout {
  width: number;
  height: number;
  left: PlacedPort[];
  right: PlacedPort[];
  byId: Record<string, PlacedPort>;
}

export function layoutPorts(ports: readonly Port[]): NodeLayout {
  const inputs = ports.filter((p) => p.direction === "input");
  const outputs = ports.filter((p) => p.direction === "output");
  const left: Port[] = [...inputs];
  const right: Port[] = [...outputs];
  for (const p of ports.filter((x) => x.direction === "bidirectional")) {
    (left.length < right.length ? left : right).push(p);
  }
  const place = (list: Port[], side: Side, opposite: Port[]): PlacedPort[] =>
    list.map((port, row) => ({ port, side, row, offsetY: NODE_HEADER + row * PORT_ROW + PORT_ROW / 2, fullWidth: !opposite[row] }));
  const l = place(left, "left", right);
  const r = place(right, "right", left);
  const rows = Math.max(l.length, r.length, 1);
  const byId: Record<string, PlacedPort> = {};
  for (const p of [...l, ...r]) byId[p.port.port_id] = p;
  return { width: NODE_WIDTH, height: NODE_HEADER + rows * PORT_ROW + NODE_PADDING_BOTTOM, left: l, right: r, byId };
}

const cache = new WeakMap<readonly Port[], NodeLayout>();

export function cachedLayout(ports: readonly Port[]): NodeLayout {
  let layout = cache.get(ports);
  if (!layout) {
    layout = layoutPorts(ports);
    cache.set(ports, layout);
  }
  return layout;
}

export function portSummary(ports: readonly Port[]): string {
  const count = (d: Port["direction"]) => ports.filter((p) => p.direction === d).length;
  const parts = [`${count("input")} in`, `${count("output")} out`];
  const bi = count("bidirectional");
  if (bi) parts.push(`${bi} bi`);
  return parts.join(" · ");
}
