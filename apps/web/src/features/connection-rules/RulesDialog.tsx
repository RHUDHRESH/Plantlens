/**
 * Connection rules editor: built-ins (enable + parameters), the medium matrix, custom rules
 * (no-code builder, priority order, test), and JSON import/export. Edits apply to the canvas
 * immediately; Save persists them for the plant (engineer only; the API re-validates).
 */
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { ArrowDown, ArrowUp, Copy, Download, Plus, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Button, IconButton, Mono, StatusBadge } from "../../components/ui/primitives";
import { describeRule } from "./customRules";
import { BUILTIN_META, newCustomRule } from "./defaults";
import type { EngineContext } from "./engine";
import { MatrixGrid } from "./MatrixGrid";
import { MEDIUM_LABEL, mediumColor } from "./media";
import { RuleBuilder, ruleOptions } from "./RuleBuilder";
import { isRulesDirty, useRulesStore } from "./rulesStore";
import { parseRuleSetJson, serializeRuleSet } from "./schema";
import { MEDIA, type BuiltinRuleKey, type ConnectionRuleSet, type Enforcement, type FanLimit, type Medium, type RuleComponent, type Verdict } from "./types";

type Tab = "builtins" | "matrix" | "custom" | "io";

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="cr-switch" disabled={disabled} onClick={() => onChange(!checked)}>
      <span className="cr-switch__thumb" />
    </button>
  );
}

function SeveritySelect({ value, onChange, disabled, allowAllow }: { value: Verdict | Enforcement; onChange: (v: Verdict) => void; disabled?: boolean; allowAllow?: boolean }) {
  return (
    <select className="pl-select cr-select" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as Verdict)} aria-label="Severity">
      {allowAllow ? <option value="allow">Allow</option> : null}
      <option value="warn">Warn</option>
      <option value="deny">Deny</option>
    </select>
  );
}

function LimitInput({ value, onChange, label, disabled, placeholder }: { value: number | null | undefined; onChange: (v: number | null | undefined) => void; label: string; disabled?: boolean; placeholder?: string }) {
  return (
    <input
      className="pl-input pl-mono cr-limit"
      type="number"
      min={1}
      aria-label={label}
      placeholder={placeholder ?? "∞"}
      disabled={disabled}
      value={value ?? ""}
      onChange={(e) => {
        const raw = e.target.value.trim();
        onChange(raw === "" ? null : Math.max(1, Math.round(Number(raw))));
      }}
    />
  );
}

function BuiltinCard({ k, rules, update, disabled, children }: { k: BuiltinRuleKey; rules: ConnectionRuleSet; update: (fn: (r: ConnectionRuleSet) => void) => void; disabled: boolean; children?: ReactNode }) {
  const meta = BUILTIN_META[k];
  const enabled = rules.builtins[k].enabled;
  return (
    <section className="cr-card" data-enabled={enabled || undefined}>
      <div className="cr-card__head">
        <Switch checked={enabled} label={`${meta.title} enabled`} disabled={disabled} onChange={(v) => update((r) => void (r.builtins[k].enabled = v))} />
        <div>
          <h4>{meta.title}</h4>
          <p>{meta.description}</p>
        </div>
        {!meta.overridable ? <span className="cr-tag">not overridable</span> : null}
        {!meta.duringDrag ? <span className="cr-tag">validation only</span> : null}
      </div>
      {enabled && children ? <div className="cr-card__body">{children}</div> : null}
    </section>
  );
}

function BuiltinsTab({ rules, update, disabled, onOpenMatrix }: { rules: ConnectionRuleSet; update: (fn: (r: ConnectionRuleSet) => void) => void; disabled: boolean; onOpenMatrix: () => void }) {
  const b = rules.builtins;
  const [showMedia, setShowMedia] = useState(false);
  return (
    <div className="cr-builtins">
      <BuiltinCard k="medium_compatibility" rules={rules} update={update} disabled={disabled}>
        <label className="st-check">
          <input type="checkbox" checked={b.medium_compatibility.check_quantity} disabled={disabled} onChange={(e) => update((r) => void (r.builtins.medium_compatibility.check_quantity = e.target.checked))} />
          <span>Quantity kinds must agree (e.g. torque cannot feed rpm)</span>
        </label>
        <Button size="sm" variant="ghost" onClick={onOpenMatrix}>
          Edit the compatibility matrix →
        </Button>
      </BuiltinCard>
      <BuiltinCard k="direction" rules={rules} update={update} disabled={disabled}>
        <label className="cr-inline">
          Wrong direction <SeveritySelect value={b.direction.severity} disabled={disabled} onChange={(v) => update((r) => void (r.builtins.direction.severity = v as Enforcement))} />
        </label>
      </BuiltinCard>
      <BuiltinCard k="max_connections" rules={rules} update={update} disabled={disabled}>
        <div className="cr-inline-row">
          <label className="cr-inline">
            Over the limit <SeveritySelect value={b.max_connections.severity} disabled={disabled} onChange={(v) => update((r) => void (r.builtins.max_connections.severity = v as Enforcement))} />
          </label>
          <label className="cr-inline">
            Default fan-out
            <LimitInput label="Default fan-out" value={b.max_connections.default.fan_out} disabled={disabled} onChange={(v) => update((r) => void (r.builtins.max_connections.default.fan_out = v))} />
          </label>
          <label className="cr-inline">
            Default fan-in
            <LimitInput label="Default fan-in" value={b.max_connections.default.fan_in} disabled={disabled} onChange={(v) => update((r) => void (r.builtins.max_connections.default.fan_in = v))} />
          </label>
          <Button size="sm" variant="ghost" onClick={() => setShowMedia((s) => !s)} aria-expanded={showMedia}>
            {showMedia ? "Hide" : "Per medium…"}
          </Button>
        </div>
        {showMedia ? (
          <table className="pl-table cr-table">
            <thead>
              <tr>
                <th>Medium</th>
                <th>Fan-out</th>
                <th>Fan-in</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {MEDIA.map((m) => {
                const lim: FanLimit | undefined = b.max_connections.limits[m];
                const setLim = (k: keyof FanLimit, v: number | null | undefined) =>
                  update((r) => {
                    const cur = { ...(r.builtins.max_connections.limits[m] ?? {}) };
                    cur[k] = v;
                    r.builtins.max_connections.limits[m] = cur;
                  });
                return (
                  <tr key={m}>
                    <td>
                      <span className="cr-medium" style={{ ["--c" as string]: mediumColor(m) }}>
                        {MEDIUM_LABEL[m]}
                      </span>
                    </td>
                    <td>
                      <LimitInput label={`${m} fan-out`} value={lim && "fan_out" in lim ? lim.fan_out : undefined} placeholder="default" disabled={disabled} onChange={(v) => setLim("fan_out", v)} />
                    </td>
                    <td>
                      <LimitInput label={`${m} fan-in`} value={lim && "fan_in" in lim ? lim.fan_in : undefined} placeholder="default" disabled={disabled} onChange={(v) => setLim("fan_in", v)} />
                    </td>
                    <td>
                      {lim ? (
                        <IconButton size="sm" label={`Use defaults for ${m}`} icon={<RotateCcw />} disabled={disabled} onClick={() => update((r) => void delete r.builtins.max_connections.limits[m])} />
                      ) : (
                        <span className="st-muted">default</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
        <p className="cr-hint">Empty = unlimited. A bidirectional port shares one budget for both roles.</p>
      </BuiltinCard>
      <BuiltinCard k="nominal_range" rules={rules} update={update} disabled={disabled}>
        <label className="cr-inline">
          Ranges don't overlap <SeveritySelect value={b.nominal_range.severity} disabled={disabled} onChange={(v) => update((r) => void (r.builtins.nominal_range.severity = v as Enforcement))} />
        </label>
        <div className="cr-inline-row">
          <span className="cr-label">Always deny on</span>
          {MEDIA.map((m) => {
            const on = b.nominal_range.safety_media.includes(m);
            return (
              <button
                key={m}
                type="button"
                className="cr-chip"
                aria-pressed={on}
                disabled={disabled}
                onClick={() =>
                  update((r) => {
                    const list = r.builtins.nominal_range.safety_media;
                    r.builtins.nominal_range.safety_media = on ? list.filter((x) => x !== m) : [...list, m];
                  })
                }
              >
                {MEDIUM_LABEL[m]}
              </button>
            );
          })}
        </div>
      </BuiltinCard>
      <BuiltinCard k="self_connection" rules={rules} update={update} disabled={disabled}>
        <label className="st-check">
          <input type="checkbox" checked={b.self_connection.allow_same_node} disabled={disabled} onChange={(e) => update((r) => void (r.builtins.self_connection.allow_same_node = e.target.checked))} />
          <span>Allow connecting two different ports of the same component</span>
        </label>
      </BuiltinCard>
      <BuiltinCard k="duplicate_edge" rules={rules} update={update} disabled={disabled} />
      <BuiltinCard k="cycle_policy" rules={rules} update={update} disabled={disabled}>
        <label className="cr-inline">
          Default for closed loops <SeveritySelect allowAllow value={b.cycle_policy.default} disabled={disabled} onChange={(v) => update((r) => void (r.builtins.cycle_policy.default = v))} />
        </label>
        <div className="cr-medium-grid">
          {MEDIA.map((m) => (
            <label key={m} className="cr-inline">
              <span className="cr-medium" style={{ ["--c" as string]: mediumColor(m) }}>
                {MEDIUM_LABEL[m]}
              </span>
              <select
                className="pl-select cr-select"
                value={b.cycle_policy.per_medium[m] ?? ""}
                disabled={disabled}
                aria-label={`Loops on ${MEDIUM_LABEL[m]}`}
                onChange={(e) =>
                  update((r) => {
                    if (e.target.value) r.builtins.cycle_policy.per_medium[m] = e.target.value as Verdict;
                    else delete r.builtins.cycle_policy.per_medium[m];
                  })
                }
              >
                <option value="">Default</option>
                <option value="allow">Allow</option>
                <option value="warn">Warn</option>
                <option value="deny">Deny</option>
              </select>
            </label>
          ))}
        </div>
      </BuiltinCard>
      <BuiltinCard k="required_ports" rules={rules} update={update} disabled={disabled}>
        <label className="cr-inline">
          Unconnected required port <SeveritySelect value={b.required_ports.severity} disabled={disabled} onChange={(v) => update((r) => void (r.builtins.required_ports.severity = v as Enforcement))} />
        </label>
      </BuiltinCard>
      <BuiltinCard k="tag_compatibility" rules={rules} update={update} disabled={disabled}>
        <label className="cr-inline">
          Disjoint tags <SeveritySelect value={b.tag_compatibility.severity} disabled={disabled} onChange={(v) => update((r) => void (r.builtins.tag_compatibility.severity = v as Enforcement))} />
        </label>
      </BuiltinCard>
    </div>
  );
}

function CustomTab({ rules, update, disabled, ctx, components, categoryLabels }: { rules: ConnectionRuleSet; update: (fn: (r: ConnectionRuleSet) => void) => void; disabled: boolean; ctx: EngineContext | null; components: readonly RuleComponent[]; categoryLabels: Record<string, string> }) {
  const [editing, setEditing] = useState<number | null>(rules.custom.length ? 0 : null);
  const options = useMemo(() => ruleOptions(components, categoryLabels), [components, categoryLabels]);
  const ordered = rules.custom.map((rule, index) => ({ rule, index })).sort((a, z) => z.rule.priority - a.rule.priority || a.index - z.index);
  const current = editing !== null ? rules.custom[editing] : undefined;

  const move = (index: number, dir: -1 | 1) => {
    // Re-assign priorities from the displayed order so "up" always means "evaluated earlier".
    const pos = ordered.findIndex((o) => o.index === index);
    const swap = ordered[pos + dir];
    if (!swap) return;
    const order = ordered.map((o) => o.index);
    [order[pos], order[pos + dir]] = [order[pos + dir]!, order[pos]!];
    update((r) => {
      order.forEach((idx, i) => {
        r.custom[idx]!.priority = (order.length - i) * 10;
      });
    });
  };

  return (
    <div className="cr-custom">
      <div className="cr-custom__list">
        <div className="cr-custom__list-head">
          <span className="cr-label">Evaluated top to bottom</span>
          <Button
            size="sm"
            icon={<Plus />}
            disabled={disabled}
            onClick={() => {
              update((r) => void r.custom.push(newCustomRule(r.custom)));
              setEditing(rules.custom.length);
            }}
          >
            New rule
          </Button>
        </div>
        {ordered.length === 0 ? (
          <p className="cr-empty">No custom rules yet. Add one to deny, warn about, or explicitly allow specific connections.</p>
        ) : (
          <ol className="cr-rule-list">
            {ordered.map(({ rule, index }, pos) => (
              <li key={`${rule.id}-${index}`} data-active={editing === index || undefined} data-enabled={rule.enabled || undefined}>
                <button type="button" className="cr-rule-list__main" onClick={() => setEditing(index)} aria-current={editing === index || undefined}>
                  <span className="cr-rule-list__title">
                    <StatusBadge compact status={rule.action === "deny" ? "critical" : rule.action === "warn" ? "medium" : "acked"} label={rule.action} />
                    {rule.name}
                  </span>
                  <span className="cr-rule-list__desc">{describeRule(rule)}</span>
                  <span className="cr-rule-list__meta pl-mono">
                    p{rule.priority} · {rule.id}
                    {!rule.enabled ? " · disabled" : ""}
                  </span>
                </button>
                <div className="cr-rule-list__actions">
                  <IconButton size="sm" label="Move up (evaluate earlier)" icon={<ArrowUp />} disabled={disabled || pos === 0} onClick={() => move(index, -1)} />
                  <IconButton size="sm" label="Move down" icon={<ArrowDown />} disabled={disabled || pos === ordered.length - 1} onClick={() => move(index, 1)} />
                  <IconButton
                    size="sm"
                    label="Duplicate rule"
                    icon={<Copy />}
                    disabled={disabled}
                    onClick={() =>
                      update((r) => {
                        const base = newCustomRule(r.custom);
                        r.custom.push({ ...structuredClone(rule), id: base.id, name: `${rule.name} (copy)` });
                      })
                    }
                  />
                  <IconButton
                    size="sm"
                    label="Delete rule"
                    icon={<Trash2 />}
                    disabled={disabled}
                    onClick={() => {
                      update((r) => void r.custom.splice(index, 1));
                      setEditing(null);
                    }}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="cr-custom__editor">
        {current && editing !== null ? (
          <RuleBuilder
            rule={current}
            options={options}
            ctx={ctx}
            disabled={disabled}
            idTaken={(id) => rules.custom.some((r, i) => i !== editing && r.id === id)}
            onChange={(next) => update((r) => void (r.custom[editing] = next))}
          />
        ) : (
          <p className="cr-empty">Select a rule to edit it.</p>
        )}
      </div>
    </div>
  );
}

function ImportExportTab({ rules, disabled, onImport, onReset, plantId }: { rules: ConnectionRuleSet; disabled: boolean; onImport: (r: ConnectionRuleSet) => void; onReset: () => void; plantId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[] | null>(null);
  const [imported, setImported] = useState<string | null>(null);
  const download = () => {
    const blob = new Blob([serializeRuleSet(rules)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `connection-rules-${plantId}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const onFile = async (file: File) => {
    const result = parseRuleSetJson(await file.text());
    if (!result.ok) {
      setErrors(result.errors);
      setImported(null);
      return;
    }
    setErrors(null);
    setImported(`${file.name}: ${result.rules.custom.length} custom rule${result.rules.custom.length === 1 ? "" : "s"} loaded. Review, then Save.`);
    onImport(result.rules);
  };
  return (
    <div className="cr-io">
      <section className="cr-card">
        <h4>Export</h4>
        <p>Download the rules in effect (including unsaved edits) as JSON.</p>
        <Button icon={<Download />} onClick={download}>
          Download JSON
        </Button>
      </section>
      <section className="cr-card">
        <h4>Import</h4>
        <p>Replace the working rules with a JSON file. Unknown fields are rejected so a typo never disables a rule silently.</p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          data-testid="rules-import-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = "";
          }}
        />
        <Button icon={<Upload />} disabled={disabled} onClick={() => fileRef.current?.click()}>
          Choose file…
        </Button>
        {errors ? (
          <div className="pl-error" role="alert">
            <strong>That file is not a valid rule set.</strong>
            <ul>
              {errors.map((e) => (
                <li key={e}>
                  <Mono>{e}</Mono>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {imported ? <p role="status" className="cr-test-result">{imported}</p> : null}
      </section>
      <section className="cr-card">
        <h4>Defaults</h4>
        <p>Start over from the built-in defaults (not saved until you press Save).</p>
        <Button icon={<RotateCcw />} disabled={disabled} onClick={onReset}>
          Reset to defaults
        </Button>
      </section>
    </div>
  );
}

export function RulesDialog({
  open,
  onOpenChange,
  plantId,
  ctx,
  components,
  categoryLabels,
  canEdit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plantId: string;
  ctx: EngineContext | null;
  components: readonly RuleComponent[];
  categoryLabels: Record<string, string>;
  canEdit: boolean;
}) {
  const [tab, setTab] = useState<Tab>("builtins");
  const rules = useRulesStore((s) => s.rules);
  const saved = useRulesStore((s) => s.saved);
  const revision = useRulesStore((s) => s.revision);
  const status = useRulesStore((s) => s.status);
  const error = useRulesStore((s) => s.error);
  const conflictRevision = useRulesStore((s) => s.conflictRevision);
  const setRules = useRulesStore((s) => s.setRules);
  const dirty = isRulesDirty({ rules, saved });
  const disabled = !canEdit;
  const update = (fn: (r: ConnectionRuleSet) => void) =>
    setRules((r) => {
      fn(r);
      return r;
    });
  const invalid = rules.custom.some((r) => !r.message.trim() || !r.name.trim() || !/^[A-Za-z0-9_.:-]{1,64}$/.test(r.id)) ||
    new Set(rules.custom.map((r) => r.id)).size !== rules.custom.length;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="pl-dialog-overlay" />
        <Dialog.Content
          className="pl-dialog cr-dialog"
          aria-describedby="cr-desc"
          onOpenAutoFocus={(e) => {
            // Land on the active tab (not the close button, whose tooltip would pop up).
            e.preventDefault();
            (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[role="tab"][data-state="active"]')?.focus();
          }}
        >
          <div className="cr-dialog__head">
            <div>
              <Dialog.Title className="pl-dialog__title">Connection rules</Dialog.Title>
              <Dialog.Description id="cr-desc" className="pl-dialog__desc">
                What may connect to what. Edits apply to the canvas immediately; Save stores them for plant <Mono>{plantId}</Mono>
                {revision ? (
                  <>
                    {" "}
                    (revision <Mono>{revision}</Mono>)
                  </>
                ) : (
                  " (built-in defaults, never saved)"
                )}
                .
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <IconButton label="Close" icon={<X />} />
            </Dialog.Close>
          </div>
          <Tabs.Root value={tab} onValueChange={(v) => setTab(v as Tab)} className="cr-tabs">
            <Tabs.List className="cr-tabs__list" aria-label="Rule sections">
              <Tabs.Trigger value="builtins" className="cr-tabs__trigger">
                Built-in rules
              </Tabs.Trigger>
              <Tabs.Trigger value="matrix" className="cr-tabs__trigger">
                Compatibility matrix
              </Tabs.Trigger>
              <Tabs.Trigger value="custom" className="cr-tabs__trigger">
                Custom rules <span className="cr-count">{rules.custom.length}</span>
              </Tabs.Trigger>
              <Tabs.Trigger value="io" className="cr-tabs__trigger">
                Import / export
              </Tabs.Trigger>
            </Tabs.List>
            <div className="cr-tabs__panels">
              <Tabs.Content value="builtins">
                <BuiltinsTab rules={rules} update={update} disabled={disabled} onOpenMatrix={() => setTab("matrix")} />
              </Tabs.Content>
              <Tabs.Content value="matrix">
                <p className="cr-hint">Rows are the source (output) medium, columns the target (input) medium. Click a cell to cycle allow → warn → deny.</p>
                <MatrixGrid
                  matrix={rules.builtins.medium_compatibility.matrix}
                  disabled={disabled || !rules.builtins.medium_compatibility.enabled}
                  onChange={(from: Medium, to: Medium, v: Verdict) =>
                    update((r) => {
                      const row = { ...(r.builtins.medium_compatibility.matrix[from] ?? {}) };
                      row[to] = v;
                      r.builtins.medium_compatibility.matrix[from] = row;
                    })
                  }
                />
              </Tabs.Content>
              <Tabs.Content value="custom">
                <CustomTab rules={rules} update={update} disabled={disabled} ctx={ctx} components={components} categoryLabels={categoryLabels} />
              </Tabs.Content>
              <Tabs.Content value="io">
                <ImportExportTab
                  rules={rules}
                  disabled={disabled}
                  plantId={plantId}
                  onImport={(r) => useRulesStore.getState().replaceRules(r)}
                  onReset={() => useRulesStore.getState().resetToDefaults()}
                />
              </Tabs.Content>
            </div>
          </Tabs.Root>
          {error ? (
            <div className="pl-error cr-dialog__error" role="alert">
              <strong>{error.message}</strong>
              {error.fix ? <span> {error.fix}</span> : null}
              {conflictRevision !== null ? (
                <span className="cr-dialog__conflict">
                  <Button size="sm" onClick={() => void useRulesStore.getState().load(plantId)}>
                    Reload theirs
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void useRulesStore.getState().save(plantId, { overwrite: true })}>
                    Overwrite with mine
                  </Button>
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="cr-dialog__foot">
            <span className="st-muted">{!canEdit ? "Read-only: only engineers can change rules." : dirty ? "Unsaved changes (already applied to the canvas)." : "Saved."}</span>
            <Button variant="ghost" disabled={!dirty || disabled} onClick={() => useRulesStore.getState().discard()}>
              Discard changes
            </Button>
            <Button variant="primary" disabled={!dirty || disabled || invalid} busy={status === "saving"} onClick={() => void useRulesStore.getState().save(plantId)}>
              Save rules
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
