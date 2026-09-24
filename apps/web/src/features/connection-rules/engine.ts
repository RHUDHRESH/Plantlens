/**
 * Connection rule engine — pure, synchronous and fast enough to run on every pointer move while a
 * connection is being dragged (xyflow `isValidConnection`). Build an EngineContext once per
 * assembly/library change; evaluate() is then O(ports) except for the cycle check (BFS, cached).
 *
 * Verdict = worst non-overridden reason: deny > warn > allow. `info` reasons never change it.
 */
import { BUILTIN_META } from "./defaults";
import { customRuleMatches, orderedCustomRules, type Endpoint } from "./customRules";
import { GENERIC_TAG_MEDIA, formatRange, isMedium, mediumLabel, quantityCompatible } from "./media";
import type {
  BuiltinRuleKey,
  ConnectionRuleSet,
  Enforcement,
  Evaluation,
  FanLimit,
  Issue,
  Proposal,
  Reason,
  RuleAsset,
  RuleAssembly,
  RuleComponent,
  RuleConnection,
  RulePort,
  Verdict,
} from "./types";

const SEP = "\u0000";
const portKey = (assetId: string, portId: string) => `${assetId}${SEP}${portId}`;
const edgeKey = (c: Proposal) => [c.fromAssetId, c.fromPortId, c.toAssetId, c.toPortId].join(SEP);

export const LOOP_OK_METADATA_KEY = "loop_ok_connection_ids";

export interface EngineContext {
  assets: Map<string, RuleAsset>;
  components: Map<string, RuleComponent>;
  connections: readonly RuleConnection[];
  /** connection ids where the port is the `from` end / the `to` end. */
  usage: Map<string, { out: string[]; in: string[] }>;
  edges: Map<string, string>;
  /** medium → from asset → [{to asset, connection id}] */
  adjacency: Map<string, Map<string, { to: string; id: string }[]>>;
  loopOk: Set<string>;
  cycleCache: Map<string, string[] | null>;
}

export function buildEngineContext(
  assembly: RuleAssembly,
  components: Iterable<RuleComponent> | Map<string, RuleComponent>,
): EngineContext {
  const componentMap =
    components instanceof Map ? components : new Map([...components].map((c) => [c.component_type_id, c]));
  const assets = new Map(assembly.assets.map((a) => [a.asset_id, a]));
  const usage: EngineContext["usage"] = new Map();
  const edges = new Map<string, string>();
  const adjacency: EngineContext["adjacency"] = new Map();
  const use = (k: string) => {
    let u = usage.get(k);
    if (!u) {
      u = { out: [], in: [] };
      usage.set(k, u);
    }
    return u;
  };
  for (const c of assembly.connections) {
    use(portKey(c.from_asset_id, c.from_port_id)).out.push(c.connection_id);
    use(portKey(c.to_asset_id, c.to_port_id)).in.push(c.connection_id);
    edges.set(
      edgeKey({ fromAssetId: c.from_asset_id, fromPortId: c.from_port_id, toAssetId: c.to_asset_id, toPortId: c.to_port_id }),
      c.connection_id,
    );
    const medium = portOf(componentMap, assets, c.from_asset_id, c.from_port_id)?.medium ?? "unknown";
    let byAsset = adjacency.get(medium);
    if (!byAsset) {
      byAsset = new Map();
      adjacency.set(medium, byAsset);
    }
    const list = byAsset.get(c.from_asset_id) ?? [];
    list.push({ to: c.to_asset_id, id: c.connection_id });
    byAsset.set(c.from_asset_id, list);
  }
  const flagged = assembly.metadata?.[LOOP_OK_METADATA_KEY];
  const loopOk = new Set(Array.isArray(flagged) ? flagged.filter((v): v is string => typeof v === "string") : []);
  return { assets, components: componentMap, connections: assembly.connections, usage, edges, adjacency, loopOk, cycleCache: new Map() };
}

function portOf(
  components: Map<string, RuleComponent>,
  assets: Map<string, RuleAsset>,
  assetId: string,
  portId: string,
): RulePort | undefined {
  const asset = assets.get(assetId);
  const component = asset ? components.get(asset.component_type_id) : undefined;
  return component?.ports.find((p) => p.port_id === portId);
}

export interface ResolvedEnd extends Endpoint {
  asset: RuleAsset;
}

export function resolveEnd(ctx: EngineContext, assetId: string, portId: string): ResolvedEnd | null {
  const asset = ctx.assets.get(assetId);
  if (!asset) return null;
  const component = ctx.components.get(asset.component_type_id);
  if (!component) return null;
  const port = component.ports.find((p) => p.port_id === portId);
  return port ? { asset, component, port } : null;
}

const canSource = (p: RulePort) => p.direction === "output" || p.direction === "bidirectional";
const canSink = (p: RulePort) => p.direction === "input" || p.direction === "bidirectional";

/** Drags may start at an input (xyflow loose mode): store connections output → input. */
export function shouldSwap(from: RulePort, to: RulePort): boolean {
  return !canSource(from) && canSink(from) && canSource(to);
}

const label = (end: ResolvedEnd) => `${end.asset.display_name} · ${end.port.name}`;

export function fanLimitFor(rules: ConnectionRuleSet, medium: string): Required<{ fan_out: number | null; fan_in: number | null }> {
  const mc = rules.builtins.max_connections;
  const specific: FanLimit | undefined = isMedium(medium) ? mc.limits[medium] : undefined;
  const pick = (k: keyof FanLimit) => (specific && k in specific ? specific[k] : mc.default[k]) ?? null;
  return { fan_out: pick("fan_out"), fan_in: pick("fan_in") };
}

export function portConnectionIds(ctx: EngineContext, assetId: string, portId: string, ignore?: string | null): string[] {
  const u = ctx.usage.get(portKey(assetId, portId));
  if (!u) return [];
  return [...u.out, ...u.in].filter((id) => id !== ignore);
}

function usedAs(ctx: EngineContext, end: ResolvedEnd, role: "out" | "in", ignore: string | null): number {
  const u = ctx.usage.get(portKey(end.asset.asset_id, end.port.port_id));
  if (!u) return 0;
  // Bidirectional ports share one budget for both roles.
  const ids = end.port.direction === "bidirectional" ? [...u.out, ...u.in] : role === "out" ? u.out : u.in;
  return ids.filter((id) => id !== ignore).length;
}

/** Connection ids of a path `from` → … → `to` on one medium, or null. */
function findPath(ctx: EngineContext, medium: string, from: string, to: string, ignore: string | null): string[] | null {
  const cacheKey = [medium, from, to, ignore ?? ""].join(SEP);
  if (ctx.cycleCache.has(cacheKey)) return ctx.cycleCache.get(cacheKey) ?? null;
  const graph = ctx.adjacency.get(medium);
  let result: string[] | null = null;
  if (graph) {
    const prev = new Map<string, { node: string; id: string } | null>([[from, null]]);
    const queue = [from];
    while (queue.length && !result) {
      const node = queue.shift()!;
      for (const next of graph.get(node) ?? []) {
        if (next.id === ignore || prev.has(next.to)) continue;
        prev.set(next.to, { node, id: next.id });
        if (next.to === to) {
          const path: string[] = [];
          let cur: string = to;
          while (cur !== from) {
            const step = prev.get(cur)!;
            path.unshift(step.id);
            cur = step.node;
          }
          result = path;
          break;
        }
        queue.push(next.to);
      }
    }
  }
  ctx.cycleCache.set(cacheKey, result);
  return result;
}

function enforcementReason(ruleId: string, severity: Enforcement | Verdict, message: string, fix: string): Reason | null {
  if (severity === "allow") return null;
  return { ruleId, severity, message, fix };
}

export interface EvaluateOptions {
  /** Swap input→output drags into output→input (default true). */
  orient?: boolean;
  /** Evaluate as if this existing connection did not exist (reconnect / validation). */
  ignoreConnectionId?: string | null;
}

export function evaluateConnection(
  ctx: EngineContext,
  rules: ConnectionRuleSet,
  input: Proposal,
  options: EvaluateOptions = {},
): Evaluation {
  const ignore = options.ignoreConnectionId ?? null;
  let from = resolveEnd(ctx, input.fromAssetId, input.fromPortId);
  let to = resolveEnd(ctx, input.toAssetId, input.toPortId);
  if (!from || !to) {
    return {
      verdict: "deny",
      reasons: [
        {
          ruleId: "builtin.unknown_port",
          severity: "deny",
          message: `Unknown ${!from ? "source" : "target"} port.`,
          fix: "Connect ports declared on placed components.",
        },
      ],
      proposal: input,
      swapped: false,
      medium: null,
      overriddenBy: null,
    };
  }
  let swapped = false;
  if ((options.orient ?? true) && shouldSwap(from.port, to.port)) {
    [from, to] = [to, from];
    swapped = true;
  }
  const proposal: Proposal = {
    fromAssetId: from.asset.asset_id,
    fromPortId: from.port.port_id,
    toAssetId: to.asset.asset_id,
    toPortId: to.port.port_id,
  };
  const b = rules.builtins;
  const reasons: (Reason & { builtin?: BuiltinRuleKey })[] = [];
  const push = (builtin: BuiltinRuleKey, r: Reason | null) => {
    if (r) reasons.push({ ...r, builtin });
  };
  const medium = from.port.medium;

  // Self connection (the same handle is also blocked by xyflow).
  if (from.asset.asset_id === to.asset.asset_id && (from.port.port_id === to.port.port_id || (b.self_connection.enabled && !b.self_connection.allow_same_node))) {
    push("self_connection", {
      ruleId: "builtin.self_connection",
      severity: "deny",
      message: `${from.asset.display_name} cannot connect to itself.`,
      fix: "Connect to a port on another component.",
    });
  }

  if (b.duplicate_edge.enabled) {
    const reverse = { fromAssetId: proposal.toAssetId, fromPortId: proposal.toPortId, toAssetId: proposal.fromAssetId, toPortId: proposal.fromPortId };
    const existing = ctx.edges.get(edgeKey(proposal)) ?? ctx.edges.get(edgeKey(reverse));
    if (existing && existing !== ignore) {
      push("duplicate_edge", {
        ruleId: "builtin.duplicate_edge",
        severity: "deny",
        message: `${label(from)} and ${label(to)} are already connected (${existing}).`,
        fix: "Select the existing connection instead of drawing a second one.",
      });
    }
  }

  if (b.direction.enabled) {
    let problem: string | null = null;
    if (!canSource(from.port)) problem = `${label(from)} is an input and cannot drive a connection.`;
    else if (!canSink(to.port)) problem = `${label(to)} is an output and cannot receive a connection.`;
    else if (from.port.direction === "output" && to.port.direction === "output" && !(medium === "mounting" && to.port.medium === "mounting")) {
      problem = "Output-to-output connections are invalid.";
    }
    if (problem) {
      push("direction", enforcementReason("builtin.direction", b.direction.severity, problem, "Connect an output to an input."));
    }
  }

  if (b.medium_compatibility.enabled) {
    const toMedium = to.port.medium;
    const cell = isMedium(medium) && isMedium(toMedium) ? b.medium_compatibility.matrix[medium]?.[toMedium] : undefined;
    const verdict: Verdict = cell ?? (medium === toMedium ? "allow" : "deny");
    if (verdict !== "allow") {
      push(
        "medium_compatibility",
        enforcementReason(
          "builtin.medium_compatibility",
          verdict,
          medium === toMedium
            ? `${mediumLabel(medium)} connections are ${verdict === "deny" ? "disabled" : "flagged"} in the compatibility matrix.`
            : `${mediumLabel(medium)} cannot connect to ${mediumLabel(toMedium)}.`,
          medium === toMedium ? "Change the cell in Rules → Compatibility matrix." : `Pick a ${mediumLabel(medium)} port, or add an adapter component.`,
        ),
      );
    }
    if (b.medium_compatibility.check_quantity && medium === toMedium) {
      const warnings = quantityCompatible(medium, from.port.quantity_kind, to.port.quantity_kind);
      if (warnings === null) {
        push("medium_compatibility", {
          ruleId: "builtin.quantity",
          severity: "deny",
          message: `${from.port.quantity_kind} cannot feed ${to.port.quantity_kind} on ${mediumLabel(medium)}.`,
          fix: "Pick a port that carries the same quantity.",
        });
      } else {
        for (const w of warnings) push("medium_compatibility", { ruleId: "builtin.quantity", severity: "info", message: w, fix: "" });
      }
    }
  }

  if (b.tag_compatibility.enabled && !GENERIC_TAG_MEDIA.has(medium)) {
    const ft = from.port.compatibility_tags ?? [];
    const tt = to.port.compatibility_tags ?? [];
    if (ft.length && tt.length && !ft.some((t) => tt.includes(t))) {
      push("tag_compatibility", {
        ruleId: "builtin.tag_compatibility",
        severity: b.tag_compatibility.severity,
        message: `Tags differ (${ft.join(", ")} vs ${tt.join(", ")}); an adapter or coupling may be required.`,
        fix: "Add an adapter, or pick ports with a shared compatibility tag.",
      });
    }
  }

  if (b.nominal_range.enabled) {
    const fr = from.port.nominal_range;
    const tr = to.port.nominal_range;
    const fLo = fr?.min ?? fr?.max ?? null;
    const fHi = fr?.max ?? fr?.min ?? null;
    const tLo = tr?.min ?? tr?.max ?? null;
    const tHi = tr?.max ?? tr?.min ?? null;
    if (fLo !== null && fHi !== null && tLo !== null && tHi !== null && !(fLo <= tHi && tLo <= fHi)) {
      const safety = isMedium(medium) && b.nominal_range.safety_media.includes(medium);
      push("nominal_range", {
        ruleId: "builtin.nominal_range",
        severity: safety ? "deny" : b.nominal_range.severity,
        message: `Ranges do not overlap: ${label(from)} ${formatRange(fr, from.port.quantity_kind)} vs ${label(to)} ${formatRange(tr, to.port.quantity_kind)}.`,
        fix: safety ? "Insert a converter rated for both ranges." : "Verify ratings or add a range adapter.",
      });
    }
  }

  if (b.max_connections.enabled) {
    const limit = fanLimitFor(rules, medium);
    const outs = usedAs(ctx, from, "out", ignore);
    if (limit.fan_out !== null && outs >= limit.fan_out) {
      push("max_connections", {
        ruleId: "builtin.max_connections",
        severity: b.max_connections.severity,
        message: `${label(from)} already has ${outs} connection${outs === 1 ? "" : "s"} (limit ${limit.fan_out} for ${mediumLabel(medium)}).`,
        fix: "Delete a connection first, or raise the fan-out limit in Rules.",
      });
    }
    const toLimit = fanLimitFor(rules, to.port.medium);
    const ins = usedAs(ctx, to, "in", ignore);
    if (toLimit.fan_in !== null && ins >= toLimit.fan_in) {
      push("max_connections", {
        ruleId: "builtin.max_connections",
        severity: b.max_connections.severity,
        message: `${label(to)} already has ${ins} feed${ins === 1 ? "" : "s"} (limit ${toLimit.fan_in}).`,
        fix: "Remove the existing feed, or raise the fan-in limit in Rules.",
      });
    }
  }

  if (b.cycle_policy.enabled && from.asset.asset_id !== to.asset.asset_id) {
    const policy: Verdict = (isMedium(medium) ? b.cycle_policy.per_medium[medium] : undefined) ?? b.cycle_policy.default;
    if (policy !== "allow") {
      const path = findPath(ctx, medium, to.asset.asset_id, from.asset.asset_id, ignore);
      if (path && !path.some((id) => ctx.loopOk.has(id))) {
        push(
          "cycle_policy",
          enforcementReason(
            "builtin.cycle_policy",
            policy,
            `This closes a ${mediumLabel(medium)} loop through ${path.join(" → ")}.`,
            "Remove a connection in the loop, or flag one as an intentional loop in the inspector.",
          ),
        );
      }
    }
  }

  // Custom rules, highest priority first. `allow` overrides overridable built-ins and stops.
  let overriddenBy: string | null = null;
  for (const rule of orderedCustomRules(rules.custom)) {
    if (!customRuleMatches(rule, from, to)) continue;
    if (rule.action === "allow") {
      overriddenBy = rule.id;
      for (const r of reasons) {
        if (r.builtin && BUILTIN_META[r.builtin].overridable && r.severity !== "info") r.overridden = true;
      }
      reasons.push({ ruleId: `custom.${rule.id}`, severity: "info", message: rule.message, fix: rule.fix });
      break;
    }
    reasons.push({ ruleId: `custom.${rule.id}`, severity: rule.action, message: rule.message, fix: rule.fix });
  }

  let verdict: Verdict = "allow";
  for (const r of reasons) {
    if (r.overridden) continue;
    if (r.severity === "deny") verdict = "deny";
    else if (r.severity === "warn" && verdict === "allow") verdict = "warn";
  }
  const clean: Reason[] = reasons.map(({ builtin: _builtin, ...rest }) => rest);
  // Worst first: deny, warn, info; overridden last.
  const rank = (r: Reason) => (r.overridden ? 3 : r.severity === "deny" ? 0 : r.severity === "warn" ? 1 : 2);
  clean.sort((a, z) => rank(a) - rank(z));
  return { verdict, reasons: clean, proposal, swapped, medium, overriddenBy };
}

/** The reason to show first (worst, not overridden). */
export function primaryReason(evaluation: Evaluation): Reason | null {
  return evaluation.reasons.find((r) => !r.overridden && r.severity !== "info") ?? null;
}

export interface DropChoice {
  portId: string | null;
  evaluation: Evaluation | null;
}

/**
 * Dropping a connection on a node body: choose the best port. Prefers allow over warn, a free port,
 * a required port, then declaration order. Returns the least-bad denial when nothing is allowed.
 */
export function bestPortForDrop(
  ctx: EngineContext,
  rules: ConnectionRuleSet,
  fromAssetId: string,
  fromPortId: string,
  targetAssetId: string,
): DropChoice {
  const asset = ctx.assets.get(targetAssetId);
  const component = asset ? ctx.components.get(asset.component_type_id) : undefined;
  if (!component) return { portId: null, evaluation: null };
  let best: { score: number; portId: string; evaluation: Evaluation } | null = null;
  let bestDenied: Evaluation | null = null;
  component.ports.forEach((port, index) => {
    const evaluation = evaluateConnection(ctx, rules, { fromAssetId, fromPortId, toAssetId: targetAssetId, toPortId: port.port_id });
    if (evaluation.verdict === "deny") {
      if (!bestDenied || evaluation.reasons.length < bestDenied.reasons.length) bestDenied = evaluation;
      return;
    }
    const free = portConnectionIds(ctx, targetAssetId, port.port_id).length === 0;
    const score = (evaluation.verdict === "allow" ? 1000 : 0) + (free ? 100 : 0) + (port.required ? 10 : 0) - index * 0.01;
    if (!best || score > best.score) best = { score, portId: port.port_id, evaluation };
  });
  if (best) {
    const chosen = best as { portId: string; evaluation: Evaluation };
    return { portId: chosen.portId, evaluation: chosen.evaluation };
  }
  return { portId: null, evaluation: bestDenied };
}

/** Whole-assembly validation: every connection re-checked + required ports + unknown types. */
export function validateAssemblyRules(ctx: EngineContext, rules: ConnectionRuleSet): Issue[] {
  const issues: Issue[] = [];
  for (const asset of ctx.assets.values()) {
    if (!ctx.components.has(asset.component_type_id)) {
      issues.push({
        key: `node:${asset.asset_id}:unknown_type`,
        severity: "deny",
        ruleId: "builtin.unknown_component",
        message: `${asset.display_name} uses unknown component type ${asset.component_type_id}.`,
        fix: "Replace it with a component from the library.",
        target: { kind: "node", id: asset.asset_id },
        source: "rules",
      });
    }
  }
  for (const c of ctx.connections) {
    const evaluation = evaluateConnection(
      ctx,
      rules,
      { fromAssetId: c.from_asset_id, fromPortId: c.from_port_id, toAssetId: c.to_asset_id, toPortId: c.to_port_id },
      { orient: false, ignoreConnectionId: c.connection_id },
    );
    for (const r of evaluation.reasons) {
      if (r.overridden || r.severity === "info") continue;
      issues.push({
        key: `edge:${c.connection_id}:${r.ruleId}:${issues.length}`,
        severity: r.severity,
        ruleId: r.ruleId,
        message: `${c.connection_id}: ${r.message}`,
        fix: r.fix,
        target: { kind: "edge", id: c.connection_id },
        source: "rules",
      });
    }
  }
  const req = rules.builtins.required_ports;
  if (req.enabled) {
    for (const asset of ctx.assets.values()) {
      const component = ctx.components.get(asset.component_type_id);
      for (const port of component?.ports ?? []) {
        if (!port.required || portConnectionIds(ctx, asset.asset_id, port.port_id).length) continue;
        issues.push({
          key: `port:${asset.asset_id}:${port.port_id}`,
          severity: req.severity,
          ruleId: "builtin.required_ports",
          message: `${asset.display_name} · ${port.name} is required but not connected.`,
          fix: `Connect a ${mediumLabel(port.medium)} ${port.direction === "input" ? "source" : "consumer"} to it.`,
          target: { kind: "port", id: asset.asset_id, portId: port.port_id },
          source: "rules",
        });
      }
    }
  }
  const order = { deny: 0, warn: 1 } as const;
  return issues.sort((a, z) => order[a.severity] - order[z.severity]);
}

/** Existing connections (and potential port pairs) a custom rule would match — for "Test rule". */
export function testCustomRule(
  ctx: EngineContext,
  rule: ConnectionRuleSet["custom"][number],
): { connections: string[]; potentialPairs: number } {
  const connections: string[] = [];
  for (const c of ctx.connections) {
    const from = resolveEnd(ctx, c.from_asset_id, c.from_port_id);
    const to = resolveEnd(ctx, c.to_asset_id, c.to_port_id);
    if (from && to && customRuleMatches(rule, from, to)) connections.push(c.connection_id);
  }
  let potentialPairs = 0;
  const ends: ResolvedEnd[] = [];
  for (const asset of ctx.assets.values()) {
    const component = ctx.components.get(asset.component_type_id);
    for (const port of component?.ports ?? []) if (component) ends.push({ asset, component, port });
  }
  for (const a of ends) {
    if (!canSource(a.port)) continue;
    for (const z of ends) {
      if (a.asset.asset_id === z.asset.asset_id || !canSink(z.port)) continue;
      if (customRuleMatches(rule, a, z)) potentialPairs += 1;
    }
  }
  return { connections, potentialPairs };
}
