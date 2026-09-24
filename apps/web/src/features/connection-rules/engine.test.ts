import { describe, expect, it } from "vitest";
import library from "../../../../../packages/sample-data/component-library/standard_components.json";
import { defaultRuleSet, newCustomRule } from "./defaults";
import {
  LOOP_OK_METADATA_KEY,
  bestPortForDrop,
  buildEngineContext,
  evaluateConnection,
  fanLimitFor,
  primaryReason,
  testCustomRule,
  validateAssemblyRules,
} from "./engine";
import { quantityCompatible } from "./media";
import { ALL_COMPONENTS, assembly, conn } from "./testFixtures";
import type { ConnectionRuleSet, CustomRule, Proposal, RuleComponent } from "./types";

const P = (fromAssetId: string, fromPortId: string, toAssetId: string, toPortId: string): Proposal => ({
  fromAssetId,
  fromPortId,
  toAssetId,
  toPortId,
});

function evalOn(p: Proposal, rules: ConnectionRuleSet = defaultRuleSet(), connections = [] as ReturnType<typeof conn>[], metadata = {}) {
  const ctx = buildEngineContext(assembly(connections, metadata), ALL_COMPONENTS);
  return evaluateConnection(ctx, rules, p);
}

const ruleIds = (e: { reasons: { ruleId: string; overridden?: boolean }[] }) =>
  e.reasons.filter((r) => !r.overridden).map((r) => r.ruleId);

function custom(partial: Partial<CustomRule>, existing: CustomRule[] = []): CustomRule {
  return { ...newCustomRule(existing), ...partial };
}

describe("baseline", () => {
  it("allows a 12 V supply to feed a 12 V motor", () => {
    const e = evalOn(P("PSU1", "dc_out", "M1", "power_in"));
    expect(e.verdict).toBe("allow");
    expect(e.medium).toBe("dc_power");
    expect(primaryReason(e)).toBeNull();
  });

  it("denies unknown ports", () => {
    const e = evalOn(P("PSU1", "nope", "M1", "power_in"));
    expect(e.verdict).toBe("deny");
    expect(ruleIds(e)).toEqual(["builtin.unknown_port"]);
  });
});

describe("direction", () => {
  it("orients an input→output drag into output→input", () => {
    const e = evalOn(P("M1", "power_in", "PSU1", "dc_out"));
    expect(e.verdict).toBe("allow");
    expect(e.swapped).toBe(true);
    expect(e.proposal).toEqual(P("PSU1", "dc_out", "M1", "power_in"));
  });

  it("denies output→output and input→input", () => {
    expect(ruleIds(evalOn(P("PSU1", "dc_out", "M1", "power_out")))).toContain("builtin.direction");
    const inIn = evalOn(P("M1", "power_in", "HV1", "power_in"));
    expect(inIn.verdict).toBe("deny");
    expect(ruleIds(inIn)).toContain("builtin.direction");
  });

  it("accepts bidirectional ports both ways", () => {
    expect(evalOn(P("PLC1", "logic", "PLC2", "logic")).verdict).toBe("allow");
    expect(evalOn(P("PLC2", "logic", "PLC1", "logic")).verdict).toBe("allow");
  });

  it("can be downgraded to a warning or disabled", () => {
    const rules = defaultRuleSet();
    rules.builtins.direction.severity = "warn";
    rules.builtins.medium_compatibility.enabled = true;
    const e = evalOn(P("PSU1", "dc_out", "M1", "power_out"), rules);
    expect(e.reasons.find((r) => r.ruleId === "builtin.direction")?.severity).toBe("warn");
    rules.builtins.direction.enabled = false;
    expect(ruleIds(evalOn(P("PSU1", "dc_out", "M1", "power_out"), rules))).not.toContain("builtin.direction");
  });
});

describe("medium compatibility", () => {
  it("denies different media with a fix", () => {
    const e = evalOn(P("PSU1", "sense_out", "M1", "power_in"));
    expect(e.verdict).toBe("deny");
    const r = primaryReason(e)!;
    expect(r.ruleId).toBe("builtin.medium_compatibility");
    expect(r.message).toMatch(/Analog signal cannot connect to DC power/);
    expect(r.fix).toBeTruthy();
  });

  it("honours an edited matrix cell (warn)", () => {
    const rules = defaultRuleSet();
    rules.builtins.medium_compatibility.matrix.analog_signal!.dc_power = "warn";
    rules.builtins.medium_compatibility.check_quantity = false;
    const e = evalOn(P("PSU1", "sense_out", "M1", "power_in"), rules);
    expect(e.verdict).toBe("warn");
  });

  it("can deny a same-medium cell", () => {
    const rules = defaultRuleSet();
    rules.builtins.medium_compatibility.matrix.dc_power!.dc_power = "deny";
    expect(evalOn(P("PSU1", "dc_out", "M1", "power_in"), rules).verdict).toBe("deny");
  });

  it("checks quantity kinds on the same medium", () => {
    const e = evalOn(P("M1", "shaft_out", "T1", "torque_in"));
    expect(e.verdict).toBe("deny");
    expect(ruleIds(e)).toContain("builtin.quantity");
    const rules = defaultRuleSet();
    rules.builtins.medium_compatibility.check_quantity = false;
    expect(evalOn(P("M1", "shaft_out", "T1", "torque_in"), rules).verdict).toBe("allow");
  });

  it("reports analog scaling as info, not as a warning", () => {
    const e = evalOn(P("S1", "signal_out", "PLC1", "ai_ch1"));
    expect(e.verdict).toBe("allow");
    expect(e.reasons.some((r) => r.severity === "info" && /scaling/.test(r.message))).toBe(true);
  });

  it("mirrors ports.py quantity rules", () => {
    expect(quantityCompatible("analog_signal", "temperature", "data")).toHaveLength(1);
    expect(quantityCompatible("analog_signal", "boolean_state", "rpm")).toBeNull();
    expect(quantityCompatible("digital_signal", "rpm", "boolean_state")).toHaveLength(1);
    expect(quantityCompatible("fluid_flow", "data", "pressure")).toEqual([]);
    expect(quantityCompatible("mounting", "vibration", "physical_mount")).toEqual([]);
    expect(quantityCompatible("ethernet", "data", "data")).toEqual([]);
    expect(quantityCompatible("ac_power", "voltage", "current")).toBeNull();
  });
});

describe("nominal range", () => {
  it("denies non-overlapping ranges on safety media", () => {
    const e = evalOn(P("PSU1", "dc_out", "HV1", "power_in"));
    expect(e.verdict).toBe("deny");
    const r = e.reasons.find((x) => x.ruleId === "builtin.nominal_range")!;
    expect(r.message).toContain("11–13.5 V");
    expect(r.message).toContain("40–56 V");
  });

  it("uses the configured severity off safety media", () => {
    const rules = defaultRuleSet();
    rules.builtins.nominal_range.safety_media = [];
    expect(evalOn(P("PSU1", "dc_out", "HV1", "power_in"), rules).verdict).toBe("warn");
    rules.builtins.nominal_range.enabled = false;
    expect(evalOn(P("PSU1", "dc_out", "HV1", "power_in"), rules).verdict).toBe("allow");
  });
});

describe("self / duplicate", () => {
  it("denies self connections", () => {
    const e = evalOn(P("M1", "power_out", "M1", "power_in"));
    expect(e.verdict).toBe("deny");
    expect(ruleIds(e)).toContain("builtin.self_connection");
  });

  it("can allow different ports of the same node, never the same port", () => {
    const rules = defaultRuleSet();
    rules.builtins.self_connection.allow_same_node = true;
    expect(ruleIds(evalOn(P("M1", "power_out", "M1", "power_in"), rules))).not.toContain("builtin.self_connection");
    expect(ruleIds(evalOn(P("M1", "power_in", "M1", "power_in"), rules))).toContain("builtin.self_connection");
  });

  it("denies duplicates in either orientation and ignores the edge being reconnected", () => {
    const existing = [conn("C001", "PSU1", "dc_out", "M1", "power_in")];
    expect(ruleIds(evalOn(P("PSU1", "dc_out", "M1", "power_in"), defaultRuleSet(), existing))).toContain("builtin.duplicate_edge");
    expect(ruleIds(evalOn(P("M1", "power_in", "PSU1", "dc_out"), defaultRuleSet(), existing))).toContain("builtin.duplicate_edge");
    const ctx = buildEngineContext(assembly(existing), ALL_COMPONENTS);
    const e = evaluateConnection(ctx, defaultRuleSet(), P("PSU1", "dc_out", "M1", "power_in"), { ignoreConnectionId: "C001" });
    expect(e.verdict).toBe("allow");
  });
});

describe("max connections", () => {
  it("defaults: power outputs feed many, inputs take one", () => {
    const existing = [conn("C001", "PSU1", "dc_out", "M1", "power_in")];
    expect(evalOn(P("PSU1", "dc_out", "M2", "power_in"), defaultRuleSet(), existing).verdict).toBe("allow");
    const second = evalOn(P("PSU2", "dc_out", "M1", "power_in"), defaultRuleSet(), existing);
    expect(second.verdict).toBe("deny");
    expect(primaryReason(second)?.message).toMatch(/already has 1 feed/);
  });

  it("lets a shaft drive a coupling and a tap by default; a per-medium limit tightens it", () => {
    const existing = [conn("C001", "M1", "shaft_out", "B1", "shaft_in")];
    expect(evalOn(P("M1", "shaft_out", "B2", "shaft_in"), defaultRuleSet(), existing).verdict).toBe("allow");
    expect(fanLimitFor(defaultRuleSet(), "mechanical_rotation")).toEqual({ fan_out: null, fan_in: 1 });
    const rules = defaultRuleSet();
    rules.builtins.max_connections.limits.mechanical_rotation = { fan_out: 1 };
    expect(fanLimitFor(rules, "mechanical_rotation")).toEqual({ fan_out: 1, fan_in: 1 });
    expect(evalOn(P("M1", "shaft_out", "B2", "shaft_in"), rules, existing).verdict).toBe("deny");
  });

  it("is configurable per medium and severity", () => {
    const rules = defaultRuleSet();
    rules.builtins.max_connections.limits.dc_power = { fan_out: 1, fan_in: 2 };
    const existing = [conn("C001", "PSU1", "dc_out", "M1", "power_in")];
    expect(evalOn(P("PSU1", "dc_out", "M2", "power_in"), rules, existing).verdict).toBe("deny");
    expect(evalOn(P("PSU2", "dc_out", "M1", "power_in"), rules, existing).verdict).toBe("allow");
    rules.builtins.max_connections.severity = "warn";
    expect(evalOn(P("PSU1", "dc_out", "M2", "power_in"), rules, existing).verdict).toBe("warn");
  });

  it("treats bidirectional ports as one budget and unlimited buses by default", () => {
    const existing = [conn("C001", "PLC1", "logic", "PLC2", "logic")];
    expect(evalOn(P("PLC2", "logic", "PLC1", "logic"), defaultRuleSet(), existing).verdict).toBe("deny"); // duplicate
    const rules = defaultRuleSet();
    rules.builtins.max_connections.limits.ethernet = { fan_out: 1, fan_in: 1 };
    rules.builtins.duplicate_edge.enabled = false;
    const e = evalOn(P("PLC2", "logic", "PLC1", "logic"), rules, existing);
    expect(ruleIds(e)).toContain("builtin.max_connections");
  });
});

describe("cycle policy", () => {
  const loop = [conn("C001", "PSU1", "dc_out", "M1", "power_in"), conn("C002", "M1", "power_out", "M2", "power_in")];

  it("denies closing a DC loop by default", () => {
    const rules = defaultRuleSet();
    rules.builtins.max_connections.enabled = false;
    rules.builtins.nominal_range.enabled = false;
    const ctx = buildEngineContext(
      { ...assembly(loop), assets: assembly(loop).assets },
      ALL_COMPONENTS,
    );
    const e = evaluateConnection(ctx, rules, P("M2", "power_out", "M1", "power_in"));
    expect(e.verdict).toBe("deny");
    expect(primaryReason(e)?.ruleId).toBe("builtin.cycle_policy");
    expect(primaryReason(e)?.message).toContain("C002");
  });

  it("allows the loop when an edge on it is flagged loop-ok", () => {
    const rules = defaultRuleSet();
    rules.builtins.max_connections.enabled = false;
    const ctx = buildEngineContext(assembly(loop, { [LOOP_OK_METADATA_KEY]: ["C002"] }), ALL_COMPONENTS);
    expect(ruleIds(evaluateConnection(ctx, rules, P("M2", "power_out", "M1", "power_in")))).not.toContain("builtin.cycle_policy");
  });

  it("per-medium policy can warn or allow", () => {
    const rules = defaultRuleSet();
    rules.builtins.max_connections.enabled = false;
    rules.builtins.cycle_policy.per_medium.dc_power = "warn";
    const ctx = buildEngineContext(assembly(loop), ALL_COMPONENTS);
    expect(evaluateConnection(ctx, rules, P("M2", "power_out", "M1", "power_in")).verdict).toBe("warn");
    rules.builtins.cycle_policy.per_medium.dc_power = "allow";
    expect(evaluateConnection(buildEngineContext(assembly(loop), ALL_COMPONENTS), rules, P("M2", "power_out", "M1", "power_in")).verdict).toBe("allow");
  });
});

describe("tag compatibility", () => {
  it("warns when physical ports have disjoint tags", () => {
    const e = evalOn(P("M1", "shaft_out", "B1", "shaft_in"));
    // Motor shaft has no tags → no check.
    expect(e.verdict).toBe("allow");
    const tagged: RuleComponent = {
      ...ALL_COMPONENTS[1]!,
      component_type_id: "tagged_motor",
      ports: [{ port_id: "shaft_out", name: "Shaft", direction: "output", medium: "mechanical_rotation", quantity_kind: "rpm", required: true, compatibility_tags: ["keyed"] }],
    };
    const ctx = buildEngineContext(
      { assets: [...assembly().assets, { asset_id: "TM", component_type_id: "tagged_motor", display_name: "TM" }], connections: [] },
      [...ALL_COMPONENTS, tagged],
    );
    const w = evaluateConnection(ctx, defaultRuleSet(), P("TM", "shaft_out", "B1", "shaft_in"));
    expect(w.verdict).toBe("warn");
    expect(primaryReason(w)?.ruleId).toBe("builtin.tag_compatibility");
  });
});

describe("custom rules", () => {
  it("deny by category → type with message and fix", () => {
    const rules = defaultRuleSet();
    rules.custom = [
      custom({ id: "no-psu-motor", action: "deny", source: { categories: ["power_electrical"], component_type_ids: [], directions: [], tags_any: [], port_ids: [] }, target: { categories: [], component_type_ids: ["dc_motor_12v"], directions: [], tags_any: [], port_ids: [] }, message: "Motors need a fuse block in front.", fix: "Insert a fuse block." }),
    ];
    const e = evalOn(P("PSU1", "dc_out", "M1", "power_in"), rules);
    expect(e.verdict).toBe("deny");
    expect(primaryReason(e)).toMatchObject({ ruleId: "custom.no-psu-motor", message: "Motors need a fuse block in front.", fix: "Insert a fuse block." });
  });

  it("matches on medium, direction, tags and port ids", () => {
    const base = defaultRuleSet();
    const side = (patch: Partial<CustomRule["source"]>) => ({ categories: [], component_type_ids: [], directions: [], tags_any: [], port_ids: [], ...patch });
    base.custom = [custom({ id: "m", action: "warn", media: ["analog_signal"], message: "analog" })];
    expect(evalOn(P("S1", "signal_out", "PLC1", "ai_ch1"), base).verdict).toBe("warn");
    expect(evalOn(P("PSU1", "dc_out", "M1", "power_in"), base).verdict).toBe("allow");
    base.custom = [custom({ id: "t", action: "warn", source: side({ tags_any: ["sensor"] }), target: side({ port_ids: ["ai_ch2"] }), message: "tagged" })];
    expect(evalOn(P("S1", "signal_out", "PLC1", "ai_ch2"), base).verdict).toBe("warn");
    expect(evalOn(P("S1", "signal_out", "PLC1", "ai_ch1"), base).verdict).toBe("allow");
    base.custom = [custom({ id: "d", action: "warn", target: side({ directions: ["bidirectional"] }), message: "bidi" })];
    expect(evalOn(P("PLC1", "logic", "PLC2", "logic"), base).verdict).toBe("warn");
  });

  it("allow overrides overridable built-ins but not self/duplicate", () => {
    const rules = defaultRuleSet();
    rules.custom = [custom({ id: "adapter", action: "allow", message: "Adapter fitted on bench.", media: ["analog_signal"] })];
    const e = evalOn(P("PSU1", "sense_out", "M1", "power_in"), rules);
    expect(e.verdict).toBe("allow");
    expect(e.overriddenBy).toBe("adapter");
    expect(e.reasons.some((r) => r.overridden && r.ruleId === "builtin.medium_compatibility")).toBe(true);

    rules.custom = [custom({ id: "anything", action: "allow", message: "ok" })];
    expect(evalOn(P("M1", "power_out", "M1", "power_in"), rules).verdict).toBe("deny");
    const existing = [conn("C001", "PSU1", "dc_out", "M1", "power_in")];
    expect(evalOn(P("PSU1", "dc_out", "M1", "power_in"), rules, existing).verdict).toBe("deny");
  });

  it("priority: a higher-priority deny beats a lower allow; a higher allow stops lower denies", () => {
    const rules = defaultRuleSet();
    const deny = custom({ id: "deny", action: "deny", priority: 20, message: "no" });
    const allow = custom({ id: "allow", action: "allow", priority: 10, message: "yes" });
    rules.custom = [allow, deny];
    const a = evalOn(P("PSU1", "dc_out", "M1", "power_in"), rules);
    expect(a.verdict).toBe("deny");
    expect(a.overriddenBy).toBe("allow");
    rules.custom = [{ ...allow, priority: 30 }, deny];
    const b = evalOn(P("PSU1", "dc_out", "M1", "power_in"), rules);
    expect(b.verdict).toBe("allow");
    expect(b.reasons.some((r) => r.ruleId === "custom.deny")).toBe(false);
  });

  it("disabled rules are ignored and ties keep authoring order", () => {
    const rules = defaultRuleSet();
    rules.custom = [custom({ id: "off", enabled: false, action: "deny", message: "off" })];
    expect(evalOn(P("PSU1", "dc_out", "M1", "power_in"), rules).verdict).toBe("allow");
    rules.custom = [custom({ id: "first", action: "allow", priority: 5, message: "a" }), custom({ id: "second", action: "deny", priority: 5, message: "b" })];
    expect(evalOn(P("PSU1", "dc_out", "M1", "power_in"), rules).verdict).toBe("allow");
  });

  it("testCustomRule lists matching connections and potential pairs", () => {
    const ctx = buildEngineContext(assembly([conn("C001", "PSU1", "dc_out", "M1", "power_in"), conn("C002", "S1", "signal_out", "PLC1", "ai_ch1")]), ALL_COMPONENTS);
    const rule = custom({ id: "x", action: "warn", media: ["analog_signal"], message: "m" });
    const result = testCustomRule(ctx, rule);
    expect(result.connections).toEqual(["C002"]);
    expect(result.potentialPairs).toBeGreaterThan(0);
  });
});

describe("drop onto node body", () => {
  it("auto-picks the compatible free port", () => {
    const ctx = buildEngineContext(assembly(), ALL_COMPONENTS);
    const choice = bestPortForDrop(ctx, defaultRuleSet(), "S1", "signal_out", "PLC1");
    expect(choice.portId).toBe("ai_ch1");
    const ctx2 = buildEngineContext(assembly([conn("C001", "S1", "signal_out", "PLC1", "ai_ch1")]), ALL_COMPONENTS);
    expect(bestPortForDrop(ctx2, defaultRuleSet(), "PSU1", "sense_out", "PLC1").portId).toBe("ai_ch2");
  });

  it("works when the drag started at an input", () => {
    const ctx = buildEngineContext(assembly(), ALL_COMPONENTS);
    const choice = bestPortForDrop(ctx, defaultRuleSet(), "M1", "power_in", "PSU1");
    expect(choice.portId).toBe("dc_out");
    expect(choice.evaluation?.proposal).toEqual(P("PSU1", "dc_out", "M1", "power_in"));
  });

  it("returns the least-bad denial when nothing fits", () => {
    const ctx = buildEngineContext(assembly(), ALL_COMPONENTS);
    const choice = bestPortForDrop(ctx, defaultRuleSet(), "M1", "shaft_out", "HV1");
    expect(choice.portId).toBeNull();
    expect(choice.evaluation?.verdict).toBe("deny");
  });
});

describe("assembly validation", () => {
  it("reports violations on edges and unconnected required ports", () => {
    const ctx = buildEngineContext(assembly([conn("C001", "PSU1", "dc_out", "HV1", "power_in"), conn("C002", "PSU1", "dc_out", "M1", "power_in")]), ALL_COMPONENTS);
    const issues = validateAssemblyRules(ctx, defaultRuleSet());
    const edgeIssue = issues.find((i) => i.target.kind === "edge" && i.target.id === "C001");
    expect(edgeIssue?.ruleId).toBe("builtin.nominal_range");
    expect(issues.some((i) => i.target.kind === "edge" && i.target.id === "C002")).toBe(false);
    expect(issues.some((i) => i.target.kind === "port" && i.target.id === "M1" && i.target.portId === "shaft_out")).toBe(true);
    expect(issues[0]!.severity).toBe("deny");
  });

  it("existing connections do not count against themselves", () => {
    const ctx = buildEngineContext(assembly([conn("C001", "M1", "shaft_out", "B1", "shaft_in")]), ALL_COMPONENTS);
    expect(validateAssemblyRules(ctx, defaultRuleSet()).filter((i) => i.target.kind === "edge")).toEqual([]);
  });

  it("required port severity is configurable and can be disabled", () => {
    const rules = defaultRuleSet();
    rules.builtins.required_ports.enabled = false;
    const ctx = buildEngineContext(assembly(), ALL_COMPONENTS);
    expect(validateAssemblyRules(ctx, rules).some((i) => i.ruleId === "builtin.required_ports")).toBe(false);
  });

  it("flags unknown component types", () => {
    const ctx = buildEngineContext({ assets: [{ asset_id: "X", component_type_id: "warp_core", display_name: "X" }], connections: [] }, ALL_COMPONENTS);
    expect(validateAssemblyRules(ctx, defaultRuleSet())[0]?.ruleId).toBe("builtin.unknown_component");
  });
});

describe("real library", () => {
  const components = (library as { components: RuleComponent[] }).components;
  const assets = components.map((c) => ({ asset_id: `${c.component_type_id}_1`, component_type_id: c.component_type_id, display_name: c.display_name }));
  const ctx = buildEngineContext({ assets, connections: [] }, components);
  const ev = (a: string, ap: string, b: string, bp: string) => evaluateConnection(ctx, defaultRuleSet(), P(`${a}_1`, ap, `${b}_1`, bp)).verdict;

  it("matches backend verdicts on representative pairs", () => {
    expect(ev("dc_power_supply", "dc_out", "dc_motor_12v", "power_in")).toBe("allow");
    expect(ev("dc_power_supply", "sense_out", "plc_analog_input_module", "ai_ch1")).toBe("allow");
    expect(ev("rpm_tachometer", "signal_out", "plc_digital_input_module", "di_ch1")).toBe("allow");
    expect(ev("dc_motor_12v", "shaft_out", "belt_coupling", "shaft_in")).toBe("allow");
    expect(ev("temperature_sensor", "signal_out", "air_duct", "air_in")).toBe("deny");
    expect(ev("dc_power_supply", "dc_out", "dc_dc_converter", "dc_in")).toBe("allow");
  });

  it("evaluates every port pair of the library quickly (drag budget)", () => {
    const ports = assets.flatMap((a) => components.find((c) => c.component_type_id === a.component_type_id)!.ports.map((p) => [a.asset_id, p.port_id] as const));
    const rules = defaultRuleSet();
    const t0 = performance.now();
    let n = 0;
    for (const [fa, fp] of ports) for (const [ta, tp] of ports) {
      evaluateConnection(ctx, rules, P(fa, fp, ta, tp));
      n += 1;
    }
    const perEval = (performance.now() - t0) / n;
    expect(n).toBeGreaterThan(4000);
    expect(perEval).toBeLessThan(0.5);
  });
});
