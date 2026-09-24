import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "../../components/ui/primitives";
import { LIBRARY, assemblyWith } from "../studio-graph/testUtils";
import { describeRule } from "./customRules";
import { defaultRuleSet, newCustomRule } from "./defaults";
import { buildEngineContext } from "./engine";
import { cellVerdict, cycleVerdict } from "./MatrixGrid";
import { RulesDialog } from "./RulesDialog";
import { isRulesDirty, useRulesStore } from "./rulesStore";
import { normalizeRuleSet, parseRuleSetJson, serializeRuleSet } from "./schema";
import type { RuleComponent } from "./types";

const COMPONENTS = LIBRARY as unknown as RuleComponent[];

function reset() {
  useRulesStore.setState({ rules: defaultRuleSet(), saved: defaultRuleSet(), revision: 0, status: "ready", error: null, conflictRevision: null });
}

describe("rule set schema", () => {
  it("round-trips export → import", () => {
    const rules = defaultRuleSet();
    rules.custom = [{ ...newCustomRule([]), action: "deny", message: "No." }];
    const parsed = parseRuleSetJson(serializeRuleSet(rules));
    expect(parsed.ok && parsed.rules).toEqual(rules);
  });

  it("fills omitted built-ins and matrix cells from defaults", () => {
    const res = normalizeRuleSet({ schema_version: 1, builtins: { direction: { severity: "warn" }, medium_compatibility: { matrix: { analog_signal: { dc_power: "warn" } } } } });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rules.builtins.direction).toEqual({ enabled: true, severity: "warn" });
    expect(res.rules.builtins.medium_compatibility.matrix.analog_signal?.dc_power).toBe("warn");
    expect(res.rules.builtins.medium_compatibility.matrix.analog_signal?.analog_signal).toBe("allow");
    expect(res.rules.builtins.max_connections).toEqual(defaultRuleSet().builtins.max_connections);
  });

  it("accepts the API envelope", () => {
    expect(parseRuleSetJson(JSON.stringify({ plant_id: "p", revision: 3, rules: defaultRuleSet() })).ok).toBe(true);
  });

  it("rejects bad JSON, unknown keys, bad media, empty messages and duplicate ids with readable errors", () => {
    expect(parseRuleSetJson("{nope")).toEqual({ ok: false, errors: ["The file is not valid JSON."] });
    const typo = parseRuleSetJson(JSON.stringify({ schema_version: 1, builtins: { direction: { enabeld: false } } }));
    expect(typo.ok).toBe(false);
    const badMedium = normalizeRuleSet({ schema_version: 1, builtins: { cycle_policy: { per_medium: { plasma: "deny" } } } });
    expect(badMedium.ok).toBe(false);
    const rule = { ...newCustomRule([]), message: "" };
    const empty = normalizeRuleSet({ schema_version: 1, custom: [rule] });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.errors[0]).toMatch(/custom\.0\.message/);
    const dup = normalizeRuleSet({ schema_version: 1, custom: [newCustomRule([]), newCustomRule([])] });
    expect(dup.ok).toBe(false);
    expect(normalizeRuleSet({ schema_version: 2 }).ok).toBe(false);
  });
});

describe("matrix + descriptions", () => {
  it("cycles allow → warn → deny and falls back to the diagonal", () => {
    expect(cycleVerdict("allow")).toBe("warn");
    expect(cycleVerdict("warn")).toBe("deny");
    expect(cycleVerdict("deny")).toBe("allow");
    expect(cellVerdict({}, "dc_power", "dc_power")).toBe("allow");
    expect(cellVerdict({}, "dc_power", "ac_power")).toBe("deny");
  });

  it("describes a custom rule in words", () => {
    const r = { ...newCustomRule([]), action: "deny" as const, media: ["dc_power" as const] };
    r.source.categories = ["sensors"];
    expect(describeRule(r)).toBe("DENY when category sensors → any component on dc_power");
  });

  it("new rules get unique ids and increasing priority", () => {
    const a = newCustomRule([]);
    const b = newCustomRule([a]);
    expect(a.id).not.toBe(b.id);
    expect(b.priority).toBeGreaterThan(a.priority);
  });
});

describe("rules store", () => {
  beforeEach(reset);
  afterEach(() => vi.unstubAllGlobals());

  it("tracks dirty state and discards", () => {
    useRulesStore.getState().setRules((r) => ({ ...r, builtins: { ...r.builtins, direction: { enabled: false, severity: "deny" } } }));
    expect(isRulesDirty(useRulesStore.getState())).toBe(true);
    useRulesStore.getState().discard();
    expect(isRulesDirty(useRulesStore.getState())).toBe(false);
  });

  it("saves with base_revision and records a 409 conflict", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (body.base_revision === 0) return new Response(JSON.stringify({ plant_id: "p", revision: 1, rules: body.rules }), { status: 200 });
      return new Response(JSON.stringify({ detail: { message: "changed", current_revision: 4 } }), { status: 409 });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await useRulesStore.getState().save("p")).toBe(true);
    expect(useRulesStore.getState().revision).toBe(1);
    expect(await useRulesStore.getState().save("p")).toBe(false);
    expect(useRulesStore.getState().conflictRevision).toBe(4);
    expect(useRulesStore.getState().error?.message).toMatch(/Someone else saved/);
  });
});

describe("RulesDialog", () => {
  beforeEach(reset);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const ctx = buildEngineContext(assemblyWith(["dc_power_supply", "voltage_sensor", "plc_analog_input_module"]), COMPONENTS);
  const renderDialog = (canEdit = true) =>
    render(
      <TooltipProvider>
        <RulesDialog open onOpenChange={() => {}} plantId="demo_microgrid_001" ctx={ctx} components={COMPONENTS} categoryLabels={{ sensors: "Sensors" }} canEdit={canEdit} />
      </TooltipProvider>,
    );

  it("toggles a built-in rule and edits a parameter", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("switch", { name: "Direction enabled" }));
    expect(useRulesStore.getState().rules.builtins.direction.enabled).toBe(false);
    fireEvent.click(screen.getByRole("switch", { name: "Direction enabled" }));
    const [first] = screen.getAllByLabelText("Severity");
    fireEvent.change(screen.getByLabelText("Default fan-in"), { target: { value: "2" } });
    expect(useRulesStore.getState().rules.builtins.max_connections.default.fan_in).toBe(2);
    fireEvent.change(screen.getByLabelText("Default fan-in"), { target: { value: "" } });
    expect(useRulesStore.getState().rules.builtins.max_connections.default.fan_in).toBeNull();
    expect(first).toBeInTheDocument();
    expect(screen.getByText("Unsaved changes (already applied to the canvas).")).toBeInTheDocument();
  });

  it("edits the compatibility matrix", () => {
    renderDialog();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Compatibility matrix" }));
    const cell = screen.getByRole("button", { name: /Analog signal to DC power: denied/ });
    fireEvent.click(cell);
    expect(useRulesStore.getState().rules.builtins.medium_compatibility.matrix.analog_signal?.dc_power).toBe("allow");
  });

  it("builds a custom rule without code and tests it against the assembly", () => {
    renderDialog();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Custom rules/ }));
    fireEvent.click(screen.getByRole("button", { name: "New rule" }));
    expect(useRulesStore.getState().rules.custom).toHaveLength(1);
    const builder = document.querySelector<HTMLElement>(".cr-builder")!;
    fireEvent.click(within(builder).getAllByRole("button", { name: "Sensors" })[0]!);
    fireEvent.click(within(builder).getByRole("radio", { name: "Deny" }));
    fireEvent.change(within(builder).getByLabelText("Message shown to the engineer"), { target: { value: "Sensors never drive anything." } });
    const rule = useRulesStore.getState().rules.custom[0]!;
    expect(rule).toMatchObject({ action: "deny", message: "Sensors never drive anything.", source: { categories: ["sensors"] } });
    fireEvent.click(within(builder).getByRole("button", { name: "Test against current assembly" }));
    expect(screen.getByRole("status")).toHaveTextContent(/Matches 0 existing connections and \d+ possible port pairs/);
  });

  it("saves through the API", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => new Response(JSON.stringify({ plant_id: "p", revision: 1, rules: JSON.parse(String(init?.body)).rules }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    renderDialog();
    fireEvent.click(screen.getByRole("switch", { name: "Nominal range overlap enabled" }));
    fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
    await waitFor(() => expect(useRulesStore.getState().revision).toBe(1));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/api/studio/connection-rules/demo_microgrid_001");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body)).base_revision).toBe(0);
  });

  it("rejects an invalid import file with the reason", async () => {
    renderDialog();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Import / export" }));
    const input = screen.getByTestId("rules-import-input") as HTMLInputElement;
    const file = new File(['{"schema_version": 1, "custom": [{"id": "x"}]}'], "bad.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: () => Promise.resolve('{"schema_version": 1, "custom": [{"id": "x"}]}') });
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText("That file is not a valid rule set.")).toBeInTheDocument();
  });

  it("is read-only for non-engineers", () => {
    renderDialog(false);
    expect(screen.getByRole("switch", { name: "Direction enabled" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save rules" })).toBeDisabled();
    expect(screen.getByText("Read-only: only engineers can change rules.")).toBeInTheDocument();
  });
});
