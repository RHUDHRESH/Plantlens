/** Commands shared by the toolbar, context menus and keyboard shortcuts. */
import { useReactFlow } from "@xyflow/react";
import { useMemo } from "react";
import { computeAutoLayout } from "../model/autoLayout";
import { cachedLayout } from "../model/portLayout";
import { alignRects, distributeRects, findFreeSpot, GRID, snapPoint, type AlignMode, type Rect } from "../model/geometry";
import { useStudioStore } from "../studioStore";

export function nodeRects(ids: readonly string[]): Rect[] {
  const { history, templates } = useStudioStore.getState();
  const want = new Set(ids);
  return history.present.assets
    .filter((a) => want.has(a.asset_id))
    .map((a) => {
      const layout = cachedLayout(templates.get(a.component_type_id)?.ports ?? []);
      return { id: a.asset_id, x: a.position_2d.x, y: a.position_2d.y, width: layout.width, height: layout.height };
    });
}

export function useStudioActions() {
  const flow = useReactFlow();
  return useMemo(() => {
    const store = () => useStudioStore.getState();

    const viewportCenter = () => {
      const el = document.querySelector<HTMLElement>(".st-canvas .react-flow");
      const rect = el?.getBoundingClientRect();
      const screen = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: 400, y: 300 };
      return flow.screenToFlowPosition(screen);
    };

    return {
      viewportCenter,
      addAtCenter(templateId: string) {
        const s = store();
        const template = s.templates.get(templateId);
        if (!template) return null;
        const layout = cachedLayout(template.ports);
        const c = viewportCenter();
        const start = { x: c.x - layout.width / 2, y: c.y - layout.height / 2 };
        const want = s.snapEnabled ? snapPoint(start) : start;
        // Never stack on an existing component: take the nearest free spot around the centre.
        const p = findFreeSpot(want, layout, nodeRects(s.history.present.assets.map((a) => a.asset_id)));
        return s.addComponent(templateId, p);
      },
      fitView() {
        void flow.fitView({ padding: 0.2, duration: 240, maxZoom: 1.25 });
      },
      zoomToSelection() {
        const { nodes, edges } = store().selection;
        const assembly = store().history.present;
        const ids = new Set(nodes);
        for (const e of edges) {
          const c = assembly.connections.find((x) => x.connection_id === e);
          if (c) {
            ids.add(c.from_asset_id);
            ids.add(c.to_asset_id);
          }
        }
        if (!ids.size) {
          void flow.fitView({ padding: 0.2, duration: 240, maxZoom: 1.25 });
          return;
        }
        void flow.fitView({ nodes: [...ids].map((id) => ({ id })), padding: 0.35, duration: 240, maxZoom: 1.1 });
      },
      focusElement(target: { kind: "node" | "edge" | "port"; id: string }) {
        const s = store();
        if (target.kind === "edge") {
          const c = s.history.present.connections.find((x) => x.connection_id === target.id);
          s.setSelection({ nodes: [], edges: [target.id] });
          if (c) void flow.fitView({ nodes: [{ id: c.from_asset_id }, { id: c.to_asset_id }], padding: 0.4, duration: 300, maxZoom: 1.1 });
        } else {
          s.setSelection({ nodes: [target.id], edges: [] });
          void flow.fitView({ nodes: [{ id: target.id }], padding: 0.8, duration: 300, maxZoom: 1.1 });
        }
      },
      align(mode: AlignMode) {
        const positions = alignRects(nodeRects(store().selection.nodes), mode);
        if (Object.keys(positions).length) store().moveNodes(positions, `Align ${mode}`);
      },
      distribute(axis: "horizontal" | "vertical") {
        const positions = distributeRects(nodeRects(store().selection.nodes), axis);
        if (Object.keys(positions).length) store().moveNodes(positions, `Distribute ${axis}`);
      },
      /** Auto-arrange the selection (≥2 nodes) or the whole assembly. */
      async autoLayout() {
        const s = store();
        const picked = s.selection.nodes.length >= 2 ? [...s.selection.nodes] : undefined;
        const before = s.history.present;
        if ((picked?.length ?? before.assets.length) < 2) {
          s.showNotice("info", "Auto-arrange needs at least two components.");
          return;
        }
        let result;
        try {
          result = await computeAutoLayout(before, s.templates, picked);
        } catch (err) {
          store().showNotice("error", "Auto-arrange failed.", err instanceof Error ? err.message : undefined);
          return;
        }
        // The document changed while ELK was running: do not clobber the newer edit.
        if (!result || store().history.present !== before) return;
        const n = Object.keys(result.positions).length;
        store().applyAutoLayout(result.positions, result.routes, picked ? `Auto-arrange ${n} components` : "Auto-arrange");
        if (!picked) window.setTimeout(() => void flow.fitView({ padding: 0.12, duration: 320, maxZoom: 1.1 }), 340);
      },
      nudge(dx: number, dy: number) {
        const s = store();
        if (!s.selection.nodes.length) return;
        const step = s.snapEnabled ? GRID : 1;
        const positions: Record<string, { x: number; y: number }> = {};
        for (const r of nodeRects(s.selection.nodes)) positions[r.id] = { x: r.x + dx * step, y: r.y + dy * step };
        s.moveNodes(positions, "Nudge");
      },
      zoomIn() {
        void flow.zoomIn({ duration: 160 });
      },
      zoomOut() {
        void flow.zoomOut({ duration: 160 });
      },
    };
  }, [flow]);
}

export type StudioActions = ReturnType<typeof useStudioActions>;
