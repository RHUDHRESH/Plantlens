/**
 * Test helpers for operate pages: a signed-in session, a seeded runtime store, a fetch mock keyed
 * by URL prefix, and a router. Only imported by *.test.tsx files.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import type { RuntimeSnapshot } from "../../api/types";
import type { Role } from "../../app/session";
import { useSession } from "../../app/session";
import { useRuntimeStore } from "../../app/store/runtime";
import { TooltipProvider } from "../../components/ui/primitives";

export const COMPILED_FIXTURE = {
  plant_id: "demo",
  content_hash: "x",
  version: "1",
  asset_index: {},
  tag_index: {
    MOTOR_301_CURRENT: { asset_id: "MTR-301", unit: "A" },
    MOTOR_301_TEMP: { asset_id: "MTR-301", unit: "C" },
    BUS_101_V: { asset_id: "BUS-101", unit: "V" },
  },
  hmi_view_model: {
    view_id: "v",
    version: "1",
    map_2d: {
      nodes: [
        { id: "BUS-101", label: "DC Bus", asset_type: "distribution.dc_bus", position: { x: 660, y: 160 }, status_binding: "", tags: ["BUS_101_V"], alarms: ["DC_BUS_LOW"] },
        { id: "INV-102", label: "Motor Inverter", asset_type: "drive.inverter", position: { x: 840, y: 210 }, status_binding: "", tags: [], alarms: [] },
        { id: "MTR-301", label: "3-Phase Motor", asset_type: "load.motor_3phase", position: { x: 1020, y: 210 }, status_binding: "", tags: ["MOTOR_301_CURRENT", "MOTOR_301_TEMP"], alarms: [] },
        { id: "PV-101", label: "PV Array", asset_type: "source.solar", position: { x: 120, y: 120 }, status_binding: "", tags: [], alarms: [] },
      ],
      edges: [
        { id: "BUS-101->INV-102", from: "BUS-101", to: "INV-102", type: "power_flow" },
        { id: "INV-102->MTR-301", from: "INV-102", to: "MTR-301", type: "power_flow" },
      ],
    },
    map_3d: { nodes: [], edges: [] },
  },
};

export const RULES_FIXTURE = {
  rules: [
    { id: "MOTOR_CURRENT_HIGH", tag: "MOTOR_301_CURRENT", severity: "warning", priority: 2, message: "Motor current high", condition: { op: ">", threshold: 3 }, shelvable: false },
    { id: "DC_BUS_LOW", tag: "BUS_101_V", severity: "critical", priority: 1, message: "DC bus voltage low", condition: { op: "<", warning: 42, critical: 38 }, shelvable: false },
    { id: "MOTOR_TEMP_HIGH", tag: "MOTOR_301_TEMP", severity: "critical", priority: 1, message: "Motor temperature high", condition: { op: ">=", threshold: 75 } },
    { id: "INV_UNDERVOLTAGE", tag: "INV_102_UNDERVOLTAGE", severity: "warning", priority: 2, message: "Inverter undervoltage", condition: { op: "bool_true" }, shelvable: true, max_shelve_seconds: 900 },
  ],
};

export type FetchRoutes = Record<string, unknown | ((url: string, init?: RequestInit) => unknown)>;

/** Mock global fetch: the longest matching path prefix wins; unknown URLs return 404. */
export function mockFetch(routes: FetchRoutes) {
  const calls: { url: string; method: string }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET" });
    const key = Object.keys(routes)
      .filter((k) => url.startsWith(k) || url.includes(k))
      .sort((a, b) => b.length - a.length)[0];
    if (!key) return new Response(JSON.stringify({ detail: "not mocked" }), { status: 404 });
    const value = routes[key];
    const body = typeof value === "function" ? (value as (u: string, i?: RequestInit) => unknown)(url, init) : value;
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}

export function defaultRoutes(snapshot: RuntimeSnapshot, extra: FetchRoutes = {}): FetchRoutes {
  return {
    "/api/runtime/snapshot": snapshot,
    "/api/hmi/compiled": COMPILED_FIXTURE,
    "/api/runtime/alarm-rules": RULES_FIXTURE,
    "/api/runtime/alarms/shelved": { shelved: [] },
    "/api/runtime/trends": { now: "2026-01-01T10:33:00Z", series: [] },
    ...extra,
  };
}

export function seed(snapshot: RuntimeSnapshot, role: Role = "operator") {
  useSession.setState({ role, status: "ready", error: null, subject: `${role}-test` });
  useRuntimeStore.getState().reset();
  useRuntimeStore.getState().applySnapshot(snapshot, "2026-01-01T10:33:00Z");
}

export function renderPage(ui: ReactElement, route = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchInterval: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}
