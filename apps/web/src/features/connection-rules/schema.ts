/**
 * Import/export + normalisation of rule sets. Mirrors the pydantic schema in routers/studio.py
 * (strict: unknown keys are rejected so a typo never silently disables a rule).
 */
import { z } from "zod";
import { defaultRuleSet } from "./defaults";
import { DIRECTIONS, MEDIA, type ConnectionRuleSet } from "./types";

const medium = z.enum(MEDIA);
const verdict = z.enum(["allow", "warn", "deny"]);
const enforcement = z.enum(["warn", "deny"]);
const limit = z.number().int().min(1).max(10_000).nullable().optional();
const fan = z.object({ fan_out: limit, fan_in: limit }).strict();

const side = z
  .object({
    categories: z.array(z.string()).max(50).default([]),
    component_type_ids: z.array(z.string()).max(200).default([]),
    directions: z.array(z.enum(DIRECTIONS)).default([]),
    tags_any: z.array(z.string()).max(50).default([]),
    port_ids: z.array(z.string()).max(200).default([]),
  })
  .strict();

const emptySideValue = { categories: [], component_type_ids: [], directions: [], tags_any: [], port_ids: [] };

const customRule = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/, "Use 1–64 letters, digits, _ . : or -"),
    name: z.string().min(1).max(120),
    enabled: z.boolean().default(true),
    priority: z.number().int().min(-1000).max(1000).default(0),
    source: side.default(emptySideValue),
    target: side.default(emptySideValue),
    media: z.array(medium).default([]),
    action: verdict,
    message: z.string().min(1, "Explain why").max(500),
    fix: z.string().max(500).default(""),
  })
  .strict();

const partialBuiltins = z
  .object({
    medium_compatibility: z
      .object({ enabled: z.boolean(), check_quantity: z.boolean(), matrix: z.record(medium, z.record(medium, verdict)) })
      .strict()
      .partial(),
    direction: z.object({ enabled: z.boolean(), severity: enforcement }).strict().partial(),
    max_connections: z
      .object({ enabled: z.boolean(), severity: enforcement, default: fan, limits: z.record(medium, fan) })
      .strict()
      .partial(),
    nominal_range: z.object({ enabled: z.boolean(), severity: enforcement, safety_media: z.array(medium) }).strict().partial(),
    self_connection: z.object({ enabled: z.boolean(), allow_same_node: z.boolean() }).strict().partial(),
    duplicate_edge: z.object({ enabled: z.boolean() }).strict().partial(),
    cycle_policy: z
      .object({ enabled: z.boolean(), default: verdict, per_medium: z.record(medium, verdict) })
      .strict()
      .partial(),
    required_ports: z.object({ enabled: z.boolean(), severity: enforcement }).strict().partial(),
    tag_compatibility: z.object({ enabled: z.boolean(), severity: enforcement }).strict().partial(),
  })
  .strict()
  .partial();

const ruleSet = z
  .object({
    schema_version: z.literal(1),
    builtins: partialBuiltins.default({}),
    custom: z.array(customRule).max(500).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const r of value.custom) {
      if (seen.has(r.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate rule id "${r.id}"`, path: ["custom"] });
      seen.add(r.id);
    }
  });

export type ParseResult = { ok: true; rules: ConnectionRuleSet } | { ok: false; errors: string[] };

/** Fill any missing built-in fields from defaults (the server does the same). */
export function normalizeRuleSet(raw: unknown): ParseResult {
  const parsed = ruleSet.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  const base = defaultRuleSet();
  const b = parsed.data.builtins;
  const builtins = { ...base.builtins };
  for (const key of Object.keys(builtins) as (keyof typeof builtins)[]) {
    const patch = b[key];
    if (patch) (builtins as Record<string, unknown>)[key] = { ...base.builtins[key], ...patch };
  }
  if (b.medium_compatibility?.matrix) {
    // Merge row by row so a partial matrix keeps the default for unspecified cells.
    const matrix = { ...base.builtins.medium_compatibility.matrix };
    for (const [from, row] of Object.entries(b.medium_compatibility.matrix)) {
      matrix[from as keyof typeof matrix] = { ...matrix[from as keyof typeof matrix], ...row };
    }
    builtins.medium_compatibility = { ...builtins.medium_compatibility, matrix };
  }
  return { ok: true, rules: { schema_version: 1, builtins, custom: parsed.data.custom as ConnectionRuleSet["custom"] } };
}

export function parseRuleSetJson(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["The file is not valid JSON."] };
  }
  // Accept both a bare rule set and the API envelope {rules: …}.
  if (raw && typeof raw === "object" && "rules" in raw && !("schema_version" in raw)) raw = (raw as { rules: unknown }).rules;
  return normalizeRuleSet(raw);
}

export function serializeRuleSet(rules: ConnectionRuleSet): string {
  return `${JSON.stringify(rules, null, 2)}\n`;
}
