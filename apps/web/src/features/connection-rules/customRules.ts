import type { CustomRule, RuleComponent, RulePort, SideCondition } from "./types";

export interface Endpoint {
  component: RuleComponent;
  port: RulePort;
}

function anyOf(list: readonly string[], value: string): boolean {
  return list.length === 0 || list.includes(value);
}

/** Every non-empty field must match (AND); values inside one field are alternatives (OR). */
export function sideMatches(cond: SideCondition, end: Endpoint): boolean {
  if (!anyOf(cond.categories, end.component.category)) return false;
  if (!anyOf(cond.component_type_ids, end.component.component_type_id)) return false;
  if (!anyOf(cond.directions, end.port.direction)) return false;
  if (!anyOf(cond.port_ids, end.port.port_id)) return false;
  if (cond.tags_any.length) {
    const tags = new Set([...(end.component.tags ?? []), ...(end.port.compatibility_tags ?? [])]);
    if (!cond.tags_any.some((t) => tags.has(t))) return false;
  }
  return true;
}

export function customRuleMatches(rule: CustomRule, from: Endpoint, to: Endpoint): boolean {
  if (!sideMatches(rule.source, from) || !sideMatches(rule.target, to)) return false;
  if (rule.media.length && !(rule.media as string[]).includes(from.port.medium) && !(rule.media as string[]).includes(to.port.medium)) {
    return false;
  }
  return true;
}

/** Enabled rules, highest priority first; ties keep authoring order (stable sort). */
export function orderedCustomRules(rules: readonly CustomRule[]): CustomRule[] {
  return rules
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => rule.enabled)
    .sort((a, b) => b.rule.priority - a.rule.priority || a.index - b.index)
    .map(({ rule }) => rule);
}

export function describeSide(cond: SideCondition): string {
  const parts: string[] = [];
  if (cond.categories.length) parts.push(`category ${cond.categories.join(" or ")}`);
  if (cond.component_type_ids.length) parts.push(`type ${cond.component_type_ids.join(" or ")}`);
  if (cond.directions.length) parts.push(`${cond.directions.join("/")} port`);
  if (cond.port_ids.length) parts.push(`port ${cond.port_ids.join(" or ")}`);
  if (cond.tags_any.length) parts.push(`tagged ${cond.tags_any.join(" or ")}`);
  return parts.length ? parts.join(", ") : "any component";
}

export function describeRule(rule: CustomRule): string {
  const media = rule.media.length ? ` on ${rule.media.join(" or ")}` : "";
  return `${rule.action.toUpperCase()} when ${describeSide(rule.source)} → ${describeSide(rule.target)}${media}`;
}
