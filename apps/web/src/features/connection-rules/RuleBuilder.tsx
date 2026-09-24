/** No-code custom rule form: conditions on both ends + action, message, fix, priority. */
import { FlaskConical } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, SegmentedControl } from "../../components/ui/primitives";
import { ChipSelect } from "./ChipSelect";
import { describeRule } from "./customRules";
import { testCustomRule, type EngineContext } from "./engine";
import { MEDIUM_LABEL } from "./media";
import { DIRECTIONS, MEDIA, type CustomRule, type RuleComponent, type SideCondition, type Verdict } from "./types";

export interface RuleOptions {
  categories: { value: string; label: string }[];
  types: { value: string; label: string }[];
  tags: { value: string; label: string }[];
  ports: { value: string; label: string }[];
}

export function ruleOptions(components: readonly RuleComponent[], categoryLabels: Record<string, string>): RuleOptions {
  const categories = [...new Set(components.map((c) => c.category))].sort();
  const tags = new Set<string>();
  const ports = new Set<string>();
  for (const c of components) {
    c.tags.forEach((t) => tags.add(t));
    for (const p of c.ports) {
      ports.add(p.port_id);
      (p.compatibility_tags ?? []).forEach((t) => tags.add(t));
    }
  }
  return {
    categories: categories.map((c) => ({ value: c, label: categoryLabels[c] ?? c })),
    types: [...components].sort((a, z) => a.display_name.localeCompare(z.display_name)).map((c) => ({ value: c.component_type_id, label: c.display_name })),
    tags: [...tags].sort().map((t) => ({ value: t, label: t })),
    ports: [...ports].sort().map((p) => ({ value: p, label: p })),
  };
}

function SideEditor({ title, side, options, onChange, disabled }: { title: string; side: SideCondition; options: RuleOptions; onChange: (s: SideCondition) => void; disabled: boolean }) {
  const set = <K extends keyof SideCondition>(k: K, v: SideCondition[K]) => onChange({ ...side, [k]: v });
  return (
    <div className="cr-side">
      <h4>{title}</h4>
      <ChipSelect label="Category" options={options.categories} value={side.categories} onChange={(v) => set("categories", v)} disabled={disabled} />
      <ChipSelect
        label="Port direction"
        options={DIRECTIONS.map((d) => ({ value: d, label: d }))}
        value={side.directions}
        onChange={(v) => set("directions", v)}
        disabled={disabled}
      />
      <details className="cr-more">
        <summary>
          Component type, tags, port ids
          {side.component_type_ids.length + side.tags_any.length + side.port_ids.length
            ? ` (${side.component_type_ids.length + side.tags_any.length + side.port_ids.length})`
            : ""}
        </summary>
        <ChipSelect label="Component type" options={options.types} value={side.component_type_ids} onChange={(v) => set("component_type_ids", v)} disabled={disabled} />
        <ChipSelect label="Has any tag" options={options.tags} value={side.tags_any} onChange={(v) => set("tags_any", v)} disabled={disabled} />
        <ChipSelect label="Port id" options={options.ports} value={side.port_ids} onChange={(v) => set("port_ids", v)} disabled={disabled} />
      </details>
    </div>
  );
}

export function RuleBuilder({
  rule,
  options,
  ctx,
  onChange,
  disabled,
  idTaken,
}: {
  rule: CustomRule;
  options: RuleOptions;
  ctx: EngineContext | null;
  onChange: (rule: CustomRule) => void;
  disabled: boolean;
  idTaken: (id: string) => boolean;
}) {
  const [test, setTest] = useState<{ connections: string[]; potentialPairs: number } | null>(null);
  const set = <K extends keyof CustomRule>(k: K, v: CustomRule[K]) => {
    setTest(null);
    onChange({ ...rule, [k]: v });
  };
  const summary = useMemo(() => describeRule(rule), [rule]);
  const idError = !/^[A-Za-z0-9_.:-]{1,64}$/.test(rule.id) ? "Use 1–64 letters, digits, _ . : or -" : idTaken(rule.id) ? "Another rule already uses this id" : null;
  return (
    <div className="cr-builder">
      <p className="cr-builder__summary pl-mono">{summary}</p>
      <div className="cr-builder__row">
        <label className="pl-field">
          <span>Name</span>
          <input className="pl-input" value={rule.name} maxLength={120} disabled={disabled} onChange={(e) => set("name", e.target.value)} />
        </label>
        <label className="pl-field">
          <span>Id</span>
          <input className="pl-input pl-mono" value={rule.id} disabled={disabled} aria-invalid={!!idError} onChange={(e) => set("id", e.target.value)} />
          {idError ? <small className="cr-error">{idError}</small> : null}
        </label>
        <label className="pl-field cr-builder__priority">
          <span>Priority</span>
          <input
            className="pl-input pl-mono"
            type="number"
            min={-1000}
            max={1000}
            value={rule.priority}
            disabled={disabled}
            onChange={(e) => set("priority", Math.max(-1000, Math.min(1000, Math.round(Number(e.target.value) || 0))))}
          />
        </label>
      </div>
      <div className="cr-builder__action">
        <span className="cr-label">Then</span>
        <SegmentedControl<Verdict>
          label="Action"
          value={rule.action}
          onChange={(v) => !disabled && set("action", v)}
          options={[
            { value: "deny", label: "Deny" },
            { value: "warn", label: "Warn" },
            { value: "allow", label: "Allow (override)" },
          ]}
        />
        <label className="st-check">
          <input type="checkbox" checked={rule.enabled} disabled={disabled} onChange={(e) => set("enabled", e.target.checked)} />
          <span>Enabled</span>
        </label>
      </div>
      {rule.action === "allow" ? (
        <p className="cr-hint">
          Allow overrides built-in rules (except self-connection and duplicates) and stops lower-priority custom rules.
        </p>
      ) : null}
      <div className="cr-builder__sides">
        <SideEditor title="When the source (output) is…" side={rule.source} options={options} onChange={(s) => set("source", s)} disabled={disabled} />
        <SideEditor title="…and the target (input) is…" side={rule.target} options={options} onChange={(s) => set("target", s)} disabled={disabled} />
      </div>
      <ChipSelect
        label="On medium (either end)"
        options={MEDIA.map((m) => ({ value: m, label: MEDIUM_LABEL[m] }))}
        value={rule.media}
        onChange={(v) => set("media", v)}
        disabled={disabled}
      />
      <label className="pl-field">
        <span>Message shown to the engineer</span>
        <input className="pl-input" value={rule.message} maxLength={500} disabled={disabled} aria-invalid={!rule.message.trim()} onChange={(e) => set("message", e.target.value)} />
      </label>
      <label className="pl-field">
        <span>Fix</span>
        <input className="pl-input" value={rule.fix} maxLength={500} disabled={disabled} placeholder="What should they do instead?" onChange={(e) => set("fix", e.target.value)} />
      </label>
      <div className="cr-builder__test">
        <Button size="sm" icon={<FlaskConical />} disabled={!ctx} onClick={() => ctx && setTest(testCustomRule(ctx, rule))}>
          Test against current assembly
        </Button>
        {test ? (
          <p role="status" className="cr-test-result">
            Matches {test.connections.length} existing connection{test.connections.length === 1 ? "" : "s"}
            {test.connections.length ? `: ${test.connections.slice(0, 12).join(", ")}${test.connections.length > 12 ? "…" : ""}` : ""} and{" "}
            {test.potentialPairs} possible port pair{test.potentialPairs === 1 ? "" : "s"}.
          </p>
        ) : null}
      </div>
    </div>
  );
}
