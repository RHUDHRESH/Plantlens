import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useSession } from "../../app/session";
import { TooltipProvider } from "../../components/ui/primitives";
import { useRulesStore } from "../connection-rules/rulesStore";
import { defaultRuleSet } from "../connection-rules/defaults";
import { AssemblyStudioPage } from "./AssemblyStudioPage";
import { StudioCanvas } from "./canvas/StudioCanvas";
import { PALETTE_MIME } from "./canvas/dnd";
import { ComponentLibraryPage } from "./ComponentLibraryPage";
import { resetPersistence, usePersistStore } from "./persistence";
import { resetStudioStore, useStudioStore } from "./studioStore";
import { LIBRARY, MockDataTransfer, assemblyWith, installFlowDomShims } from "./testUtils";

type Call = { method: string; url: string; body: unknown };
let calls: Call[] = [];
let revisions: Record<string, number> = {};
let conflictOn: string | null = null;
let storedAssembly: unknown = null;

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function mockFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input);
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  calls.push({ method, url, body });
  if (url.includes("/api/library/components")) return json({ status: "ok", count: LIBRARY.length, library_id: "std", version: "1", components: LIBRARY, categories: {} });
  const doc = ["assembly", "layout", "connection-rules"].find((d) => url.includes(`/api/studio/${d}/`));
  if (doc) {
    if (method === "GET") {
      if (doc === "layout") return json({ plant_id: "demo_microgrid_001", revision: revisions[doc] ?? 0, positions: {}, viewport: null });
      if (doc === "assembly") return json({ plant_id: "demo_microgrid_001", revision: revisions[doc] ?? 0, assembly: storedAssembly });
      return json({ plant_id: "demo_microgrid_001", revision: revisions[doc] ?? 0, rules: null });
    }
    if (conflictOn === doc) return json({ detail: { message: "changed", fix: "reload", current_revision: 7 } }, 409);
    revisions[doc] = (revisions[doc] ?? 0) + 1;
    return json({ plant_id: "demo_microgrid_001", revision: revisions[doc], ...(body as object) });
  }
  return json({}, 404);
}

function renderPage(ui = <AssemblyStudioPage />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeAll(() => installFlowDomShims());

beforeEach(() => {
  calls = [];
  revisions = {};
  conflictOn = null;
  storedAssembly = null;
  resetStudioStore();
  resetPersistence();
  useRulesStore.setState({ rules: defaultRuleSet(), saved: defaultRuleSet(), revision: 0, status: "idle", error: null, conflictRevision: null });
  vi.stubGlobal("fetch", vi.fn(mockFetch));
  useSession.setState({ role: "engineer", status: "ready" });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Plant Studio page", () => {
  it("renders palette, canvas, inspector and toolbar", async () => {
    renderPage();
    expect(await screen.findByTestId("palette-dc_power_supply")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Plant Studio" })).toBeInTheDocument();
    expect(screen.getByLabelText("Search components")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Inspector" })).toBeInTheDocument();
    expect(screen.getByTestId("studio-canvas")).toBeInTheDocument();
    await waitFor(() => expect(usePersistStore.getState().status).toBe("saved"));
  });

  it("loads the saved assembly on open (tolerating null optional fields)", async () => {
    const saved = assemblyWith(["dc_power_supply", "dc_motor_12v"]);
    storedAssembly = { ...saved, assets: saved.assets.map((a) => ({ ...a, position_3d: null })) };
    revisions.assembly = 5;
    renderPage();
    await waitFor(() => expect(useStudioStore.getState().history.present.assets).toHaveLength(2));
    expect(usePersistStore.getState()).toMatchObject({ status: "saved", assemblyRevision: 5, blocked: null });
  });

  it("an unreadable saved assembly blocks autosave instead of overwriting it", async () => {
    storedAssembly = { assembly_id: "x", plant_id: "demo_microgrid_001", version: "1", assets: [{ asset_id: 42 }], connections: [] };
    revisions.assembly = 3;
    renderPage();
    const banner = await screen.findByRole("alert");
    expect(banner).toHaveTextContent(/could not be read/);
    act(() => {
      useStudioStore.getState().addComponent("dc_power_supply", { x: 0, y: 0 });
    });
    await new Promise((r) => setTimeout(r, 800));
    expect(calls.some((c) => c.method === "PUT" && c.url.includes("/assembly/"))).toBe(false);
  });

  it("palette search filters and groups", async () => {
    renderPage();
    await screen.findByTestId("palette-dc_power_supply");
    fireEvent.change(screen.getByLabelText("Search components"), { target: { value: "airflow" } });
    expect(screen.queryByTestId("palette-dc_power_supply")).not.toBeInTheDocument();
    expect(screen.getByTestId("palette-airflow_sensor")).toBeInTheDocument();
  });

  it("drag from the palette shows a snapped ghost and drops a component", async () => {
    renderPage();
    const item = await screen.findByTestId("palette-dc_power_supply");
    await waitFor(() => expect(usePersistStore.getState().loaded).toBe(true));
    const canvas = await screen.findByTestId("studio-canvas");
    const dt = new MockDataTransfer();
    fireEvent.dragStart(item, { dataTransfer: dt });
    expect(dt.getData(PALETTE_MIME)).toBe("dc_power_supply");
    expect(useStudioStore.getState().draggingTemplateId).toBe("dc_power_supply");
    fireEvent.dragOver(canvas, { dataTransfer: dt, clientX: 413, clientY: 229 });
    const ghost = document.querySelector<HTMLElement>(".st-drop-ghost");
    expect(ghost).not.toBeNull();
    // Ghost is grid-snapped (multiples of 16).
    const m = /translate\((-?\d+)px, (-?\d+)px\)/.exec(ghost!.style.transform)!;
    expect(Math.abs(Number(m[1]) % 16)).toBe(0);
    expect(Math.abs(Number(m[2]) % 16)).toBe(0);
    fireEvent.drop(canvas, { dataTransfer: dt, clientX: 413, clientY: 229 });
    const assets = useStudioStore.getState().history.present.assets;
    expect(assets).toHaveLength(1);
    expect(assets[0]!.component_type_id).toBe("dc_power_supply");
    expect(Math.abs(assets[0]!.position_2d.x % 16)).toBe(0);
    expect(document.querySelector(".st-drop-ghost")).toBeNull();
    await waitFor(() => expect(document.querySelector('.react-flow__node[data-id="dc_power_supply_1"]')).not.toBeNull());
  });

  it("ignores foreign drags (no custom MIME)", async () => {
    renderPage();
    await screen.findByTestId("palette-dc_power_supply");
    const canvas = screen.getByTestId("studio-canvas");
    const dt = new MockDataTransfer();
    dt.setData("text/plain", "hello");
    fireEvent.dragOver(canvas, { dataTransfer: dt, clientX: 10, clientY: 10 });
    fireEvent.drop(canvas, { dataTransfer: dt, clientX: 10, clientY: 10 });
    expect(useStudioStore.getState().history.present.assets).toHaveLength(0);
  });

  it("click / Enter on a palette item adds at the centre without stacking", async () => {
    renderPage();
    const item = await screen.findByTestId("palette-dc_motor_12v");
    await waitFor(() => expect(usePersistStore.getState().loaded).toBe(true));
    fireEvent.click(item);
    fireEvent.click(item);
    const [a, b] = useStudioStore.getState().history.present.assets;
    expect(a && b).toBeTruthy();
    expect(a!.position_2d).not.toEqual(b!.position_2d);
  });

  it("autosaves the assembly with base_revision and drafts only", async () => {
    renderPage();
    await screen.findByTestId("palette-dc_power_supply");
    await waitFor(() => expect(usePersistStore.getState().loaded).toBe(true));
    act(() => {
      useStudioStore.getState().loadAssembly(assemblyWith(["dc_power_supply", "dc_motor_12v"]));
    });
    act(() => {
      useStudioStore.getState().connect({ fromAssetId: "dc_power_supply_1", fromPortId: "dc_out", toAssetId: "dc_motor_12v_1", toPortId: "power_in" }, "dc_power");
    });
    expect(usePersistStore.getState().status).toBe("dirty");
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.url.includes("/api/studio/assembly/"))).toBe(true), { timeout: 2000 });
    const put = calls.find((c) => c.method === "PUT" && c.url.includes("/api/studio/assembly/"))!;
    expect((put.body as { base_revision: number }).base_revision).toBe(0);
    expect((put.body as { assembly: { connections: { approved: boolean }[] } }).assembly.connections.every((c) => !c.approved)).toBe(true);
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.url.includes("/api/studio/layout/"))).toBe(true));
    await waitFor(() => expect(usePersistStore.getState().status).toBe("saved"));
  });

  it("a 409 pauses autosave and offers Reload / Overwrite", async () => {
    renderPage();
    await screen.findByTestId("palette-dc_power_supply");
    await waitFor(() => expect(usePersistStore.getState().loaded).toBe(true));
    conflictOn = "assembly";
    act(() => {
      useStudioStore.getState().addComponent("dc_power_supply", { x: 0, y: 0 });
    });
    const banner = await screen.findByRole("alert", {}, { timeout: 2000 });
    expect(banner).toHaveTextContent(/changed elsewhere/);
    expect(usePersistStore.getState().conflict).toEqual({ doc: "assembly", currentRevision: 7 });
    conflictOn = null;
    fireEvent.click(within(banner).getByRole("button", { name: "Overwrite" }));
    await waitFor(() => expect(usePersistStore.getState().status).toBe("saved"));
    const overwrite = calls.filter((c) => c.method === "PUT" && c.url.includes("/assembly/")).at(-1)!;
    expect((overwrite.body as { base_revision: number }).base_revision).toBe(7);
  });

  it("keyboard: Delete removes the selection, Ctrl+Z restores it", async () => {
    renderPage();
    await screen.findByTestId("palette-dc_power_supply");
    await waitFor(() => expect(usePersistStore.getState().loaded).toBe(true));
    act(() => {
      useStudioStore.getState().loadAssembly(assemblyWith(["dc_power_supply", "dc_motor_12v"]));
      useStudioStore.getState().setSelection({ nodes: ["dc_motor_12v_1"] });
    });
    fireEvent.keyDown(document.body, { key: "Delete" });
    expect(useStudioStore.getState().history.present.assets.map((a) => a.asset_id)).toEqual(["dc_power_supply_1"]);
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true, metaKey: true });
    expect(useStudioStore.getState().history.present.assets).toHaveLength(2);
    // Typing in a field never triggers canvas shortcuts.
    const search = screen.getByLabelText("Search components");
    act(() => useStudioStore.getState().setSelection({ nodes: ["dc_motor_12v_1"] }));
    fireEvent.keyDown(search, { key: "Delete" });
    expect(useStudioStore.getState().history.present.assets).toHaveLength(2);
  });

  it("opens the shortcut help on ?", async () => {
    renderPage();
    await screen.findByTestId("palette-dc_power_supply");
    fireEvent.keyDown(document.body, { key: "?", shiftKey: true });
    expect(await screen.findByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
  });

  it("viewer role is read-only: palette disabled, no autosave", async () => {
    useSession.setState({ role: "viewer", status: "ready" });
    renderPage();
    const item = await screen.findByTestId("palette-dc_power_supply");
    expect(item).toBeDisabled();
    await waitFor(() => expect(usePersistStore.getState().status).toBe("readonly"));
    expect(screen.getByText(/Read-only: your role cannot edit/)).toBeInTheDocument();
    act(() => {
      useStudioStore.getState().loadAssembly(assemblyWith(["dc_power_supply"]));
      useStudioStore.getState().setSelection({ nodes: ["dc_power_supply_1"] });
    });
    fireEvent.keyDown(document.body, { key: "Delete" });
    expect(useStudioStore.getState().history.present.assets).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 800));
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("validation tab lists findings and focuses the offender", async () => {
    renderPage();
    await screen.findByTestId("palette-dc_power_supply");
    await waitFor(() => expect(usePersistStore.getState().loaded).toBe(true));
    act(() => {
      useStudioStore.getState().loadAssembly(assemblyWith(["dc_motor_12v"]));
    });
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Validation/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Validation/ }));
    const finding = await screen.findByText(/Power Input is required but not connected/);
    fireEvent.click(finding);
    expect(useStudioStore.getState().selection.nodes).toEqual(["dc_motor_12v_1"]);
  });
});

describe("canvas performance", () => {
  it("renders a 200-node assembly within a loose budget", async () => {
    const types = LIBRARY.map((c) => c.component_type_id);
    const assembly = assemblyWith(Array.from({ length: 200 }, (_, i) => types[i % types.length]!));
    useStudioStore.getState().setLibrary(LIBRARY);
    useStudioStore.getState().loadAssembly(assembly);
    const t0 = performance.now();
    renderPage(
      <ReactFlowProvider>
        <div style={{ width: 1000, height: 600 }}>
          <StudioCanvas issues={[]} readOnly={false} onOpenHelp={() => {}} defaultViewport={{ x: 0, y: 0, zoom: 1 }} />
        </div>
      </ReactFlowProvider>,
    );
    await waitFor(() => expect(document.querySelectorAll(".react-flow__node").length).toBeGreaterThan(0));
    const elapsed = performance.now() - t0;
    // onlyRenderVisibleElements culls off-screen nodes in a real viewport (jsdom has no layout).
    expect(document.querySelectorAll(".react-flow__node").length).toBeLessThanOrEqual(200);
    // jsdom is ~10× slower than a browser; DESIGN_SYSTEM budget is 1.5 s for the real editor.
    expect(elapsed).toBeLessThan(4000);
  });
});

describe("Component library page", () => {
  it("lists components with ports and filters by search", async () => {
    renderPage(<ComponentLibraryPage />);
    expect(await screen.findByRole("heading", { name: "DC Power Supply" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search components"), { target: { value: "tachometer" } });
    expect(screen.queryByRole("heading", { name: "DC Power Supply" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "RPM Tachometer" })).toBeInTheDocument();
  });
});
