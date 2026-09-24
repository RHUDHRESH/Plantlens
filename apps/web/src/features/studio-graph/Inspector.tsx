/** Right-hand inspector: properties of the selected node / edge / multi-selection. */
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowRight,
  Columns3,
  Rows3,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { PlantConnection } from "../../app/schemas/plantAssembly";
import { ComponentSymbol } from "./canvas/ComponentSymbol";
import { Button, IconButton, Mono, StatusBadge } from "../../components/ui/primitives";
import { evaluateConnection, fanLimitFor, LOOP_OK_METADATA_KEY, portConnectionIds, type EngineContext } from "../connection-rules/engine";
import { formatRange, mediumLabel } from "../connection-rules/media";
import { useRulesStore } from "../connection-rules/rulesStore";
import type { Issue } from "../connection-rules/types";
import { MediumChip } from "./canvas/EquipmentNode";
import type { StudioActions } from "./canvas/useStudioActions";
import { CATEGORY_LABELS, type ComponentCategory } from "./componentLibraryTypes";
import { assetNotes } from "./model/assemblyOps";
import { selectAssembly, useStudioStore } from "./studioStore";

/** Text field that commits once on blur/Enter (one undo entry per edit, not per keystroke). */
function CommitField({
  label,
  value,
  onCommit,
  multiline,
  disabled,
  mono,
  type = "text",
  suffix,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
  disabled?: boolean;
  mono?: boolean;
  type?: "text" | "number";
  suffix?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  const common = {
    value: draft,
    disabled,
    "aria-label": label,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: commit,
  };
  return (
    <label className="pl-field st-field">
      <span>{label}</span>
      <span className="st-field__control">
        {multiline ? (
          <textarea className="pl-textarea" rows={3} {...common} />
        ) : (
          <input
            className={`pl-input${mono ? " pl-mono" : ""}`}
            type={type}
            min={type === "number" ? 0 : undefined}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setDraft(value);
                (e.target as HTMLInputElement).blur();
              }
            }}
            {...common}
          />
        )}
        {suffix ? <span className="st-field__suffix">{suffix}</span> : null}
      </span>
    </label>
  );
}

function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="st-inspector__section">
      <div className="st-inspector__section-head">
        <h3>{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

function IssueList({ issues }: { issues: Issue[] }) {
  if (!issues.length) return null;
  return (
    <ul className="st-issue-list">
      {issues.map((i) => (
        <li key={i.key} data-severity={i.severity}>
          <StatusBadge status={i.severity === "deny" ? "critical" : "medium"} label={i.severity === "deny" ? "Violation" : "Warning"} compact />
          <div>
            <p>{i.message}</p>
            {i.fix ? <p className="st-issue-list__fix">Fix: {i.fix}</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function NodeInspector({ assetId, ctx, issues, readOnly }: { assetId: string; ctx: EngineContext; issues: readonly Issue[]; readOnly: boolean }) {
  const asset = useStudioStore((s) => s.history.present.assets.find((a) => a.asset_id === assetId));
  const template = useStudioStore((s) => (asset ? s.templates.get(asset.component_type_id) : undefined));
  const rules = useRulesStore((s) => s.rules);
  const store = useStudioStore.getState;
  if (!asset) return null;
  const mine = issues.filter((i) => i.target.id === assetId && i.target.kind !== "edge");
  return (
    <>
      <div className="st-inspector__hero">
        <ComponentSymbol componentTypeId={asset.component_type_id} size={44} />
        <div>
          <p className="st-inspector__kind">{template?.display_name ?? asset.component_type_id}</p>
          <Mono className="st-inspector__id">{asset.asset_id}</Mono>
        </div>
      </div>
      <Section title="Properties">
        <CommitField label="Label" value={asset.display_name} disabled={readOnly} onCommit={(v) => store().renameAsset(assetId, v)} />
        <dl className="st-kv">
          <dt>Type</dt>
          <dd>
            <Mono>{asset.component_type_id}</Mono>
          </dd>
          <dt>Category</dt>
          <dd>{template ? (CATEGORY_LABELS[template.category as ComponentCategory] ?? template.category) : "—"}</dd>
          <dt>Position</dt>
          <dd>
            <Mono>
              {asset.position_2d.x}, {asset.position_2d.y}
            </Mono>
          </dd>
        </dl>
        <CommitField label="Notes" value={assetNotes(asset)} multiline disabled={readOnly} onCommit={(v) => store().setAssetNotes(assetId, v)} />
      </Section>
      {mine.length ? (
        <Section title="Findings">
          <IssueList issues={mine} />
        </Section>
      ) : null}
      <Section title={`Ports (${template?.ports.length ?? 0})`}>
        <ul className="st-port-list">
          {(template?.ports ?? []).map((p) => {
            const used = portConnectionIds(ctx, assetId, p.port_id).length;
            const limit = fanLimitFor(rules, p.medium);
            const max = p.direction === "input" ? limit.fan_in : p.direction === "output" ? limit.fan_out : (limit.fan_in ?? limit.fan_out);
            const range = formatRange(p.nominal_range, p.quantity_kind);
            return (
              <li key={p.port_id}>
                <MediumChip medium={p.medium} />
                <div className="st-port-list__main">
                  <span className="st-port-list__name">
                    {p.name}
                    {p.required ? <span className="st-port-list__req" title="Required"> *</span> : null}
                  </span>
                  <span className="st-port-list__meta">
                    {p.direction} · {mediumLabel(p.medium)}
                    {range ? ` · ${range}` : ""}
                  </span>
                </div>
                <Mono className="st-port-list__count">
                  {used}/{max ?? "∞"}
                </Mono>
              </li>
            );
          })}
        </ul>
      </Section>
      {!readOnly ? (
        <div className="st-inspector__foot">
          <Button variant="danger" size="sm" icon={<Trash2 />} onClick={() => store().deleteElements([assetId], [])}>
            Delete component
          </Button>
        </div>
      ) : null}
    </>
  );
}

function EdgeInspector({ connection, ctx, readOnly }: { connection: PlantConnection; ctx: EngineContext; readOnly: boolean }) {
  const rules = useRulesStore((s) => s.rules);
  const loopOk = useStudioStore((s) => {
    const v = s.history.present.metadata?.[LOOP_OK_METADATA_KEY];
    return Array.isArray(v) && v.includes(connection.connection_id);
  });
  const store = useStudioStore.getState;
  const evaluation = useMemo(
    () =>
      evaluateConnection(
        ctx,
        rules,
        { fromAssetId: connection.from_asset_id, fromPortId: connection.from_port_id, toAssetId: connection.to_asset_id, toPortId: connection.to_port_id },
        { orient: false, ignoreConnectionId: connection.connection_id },
      ),
    [ctx, rules, connection],
  );
  const from = ctx.assets.get(connection.from_asset_id);
  const to = ctx.assets.get(connection.to_asset_id);
  const fromPort = from ? ctx.components.get(from.component_type_id)?.ports.find((p) => p.port_id === connection.from_port_id) : undefined;
  const toPort = to ? ctx.components.get(to.component_type_id)?.ports.find((p) => p.port_id === connection.to_port_id) : undefined;
  const reasons = evaluation.reasons;
  const toInt = (v: string) => Math.max(0, Math.round(Number(v) || 0));
  return (
    <>
      <div className="st-inspector__hero st-inspector__hero--edge">
        <div className="st-edge-ends">
          <div>
            <strong>{from?.display_name ?? connection.from_asset_id}</strong>
            <span>{fromPort?.name ?? connection.from_port_id}</span>
          </div>
          <ArrowRight aria-label="to" />
          <div>
            <strong>{to?.display_name ?? connection.to_asset_id}</strong>
            <span>{toPort?.name ?? connection.to_port_id}</span>
          </div>
        </div>
        <p className="st-inspector__kind">
          <Mono>{connection.connection_id}</Mono> · {evaluation.medium ? <MediumChip medium={evaluation.medium} /> : null} {evaluation.medium ? mediumLabel(evaluation.medium) : connection.connection_kind}
        </p>
      </div>
      <Section title="Approval">
        <div className="st-approval">
          {connection.approved ? <StatusBadge status="acked" label="Approved" /> : <StatusBadge status="shelved" label="Draft — not approved" />}
          <p>
            Approval happens in <Link to="/eng/approvals">Approvals</Link>, not here. Draft connections are excluded from the runtime
            causal graph until an engineer approves them. Moving an endpoint returns a connection to draft.
          </p>
        </div>
      </Section>
      <Section title="Rules">
        {reasons.filter((r) => r.severity !== "info" || r.overridden).length === 0 ? (
          <p className="st-muted">All connection rules pass.</p>
        ) : (
          <ul className="st-issue-list">
            {reasons
              .filter((r) => r.severity !== "info" || r.overridden)
              .map((r, i) => (
                <li key={`${r.ruleId}-${i}`} data-severity={r.overridden ? "overridden" : r.severity}>
                  <StatusBadge
                    status={r.overridden ? "acked" : r.severity === "deny" ? "critical" : "medium"}
                    label={r.overridden ? "Overridden" : r.severity === "deny" ? "Violation" : "Warning"}
                    compact
                  />
                  <div>
                    <p>{r.message}</p>
                    {r.fix && !r.overridden ? <p className="st-issue-list__fix">Fix: {r.fix}</p> : null}
                  </div>
                </li>
              ))}
          </ul>
        )}
        {reasons
          .filter((r) => r.severity === "info" && !r.overridden)
          .map((r, i) => (
            <p key={i} className="st-muted st-note">
              {r.message}
            </p>
          ))}
      </Section>
      <Section title="Lag window">
        <div className="st-field-row">
          <CommitField label="Min" type="number" suffix="ms" mono value={String(connection.lag_min_ms)} disabled={readOnly} onCommit={(v) => store().patchConnection(connection.connection_id, { lag_min_ms: toInt(v) })} />
          <CommitField label="Max" type="number" suffix="ms" mono value={String(connection.lag_max_ms)} disabled={readOnly} onCommit={(v) => store().patchConnection(connection.connection_id, { lag_max_ms: toInt(v) })} />
        </div>
        <p className="st-muted st-note">How long an effect takes to show downstream. Used by the causal engine once approved.</p>
        <label className="st-check">
          <input type="checkbox" checked={loopOk} disabled={readOnly} onChange={(e) => store().setConnectionLoopOk(connection.connection_id, e.target.checked)} />
          <span>Intentional feedback loop (exempt from the closed-loop rule)</span>
        </label>
      </Section>
      <Section title="Notes">
        <CommitField label="Notes" value={connection.notes ?? ""} multiline disabled={readOnly} onCommit={(v) => store().patchConnection(connection.connection_id, { notes: v })} />
      </Section>
      {!readOnly ? (
        <div className="st-inspector__foot">
          <Button variant="danger" size="sm" icon={<Trash2 />} onClick={() => store().deleteElements([], [connection.connection_id])}>
            Delete connection
          </Button>
        </div>
      ) : null}
    </>
  );
}

function MultiInspector({ actions, readOnly }: { actions: StudioActions; readOnly: boolean }) {
  const selection = useStudioStore((s) => s.selection);
  const n = selection.nodes.length;
  return (
    <>
      <div className="st-inspector__hero">
        <div>
          <p className="st-inspector__kind">
            {n} component{n === 1 ? "" : "s"}
            {selection.edges.length ? `, ${selection.edges.length} connection${selection.edges.length === 1 ? "" : "s"}` : ""}
          </p>
          <p className="st-muted">Selected</p>
        </div>
      </div>
      {n > 1 && !readOnly ? (
        <Section title="Arrange">
          <div className="st-icon-grid" role="group" aria-label="Align">
            <IconButton label="Align left" icon={<AlignStartVertical />} onClick={() => actions.align("left")} />
            <IconButton label="Align centres" icon={<AlignCenterVertical />} onClick={() => actions.align("hcenter")} />
            <IconButton label="Align right" icon={<AlignEndVertical />} onClick={() => actions.align("right")} />
            <IconButton label="Align top" icon={<AlignStartHorizontal />} onClick={() => actions.align("top")} />
            <IconButton label="Align middles" icon={<AlignCenterHorizontal />} onClick={() => actions.align("vcenter")} />
            <IconButton label="Align bottom" icon={<AlignEndHorizontal />} onClick={() => actions.align("bottom")} />
            <IconButton label="Distribute horizontally" icon={<Columns3 />} disabled={n < 3} onClick={() => actions.distribute("horizontal")} />
            <IconButton label="Distribute vertically" icon={<Rows3 />} disabled={n < 3} onClick={() => actions.distribute("vertical")} />
          </div>
        </Section>
      ) : null}
      {!readOnly ? (
        <div className="st-inspector__foot">
          <Button variant="danger" size="sm" icon={<Trash2 />} onClick={() => useStudioStore.getState().deleteSelection()}>
            Delete selection
          </Button>
        </div>
      ) : null}
    </>
  );
}

function AssemblySummary() {
  const assembly = useStudioStore(selectAssembly);
  const drafts = assembly.connections.filter((c) => !c.approved).length;
  return (
    <>
      <div className="st-inspector__hero">
        <div>
          <p className="st-inspector__kind">Assembly</p>
          <Mono className="st-inspector__id">{assembly.assembly_id}</Mono>
        </div>
      </div>
      <Section title="Summary">
        <dl className="st-kv">
          <dt>Plant</dt>
          <dd>
            <Mono>{assembly.plant_id}</Mono>
          </dd>
          <dt>Components</dt>
          <dd>
            <Mono>{assembly.assets.length}</Mono>
          </dd>
          <dt>Connections</dt>
          <dd>
            <Mono>{assembly.connections.length}</Mono>
          </dd>
          <dt>Drafts</dt>
          <dd>
            <Mono>{drafts}</Mono>
          </dd>
        </dl>
      </Section>
      <Section title="How to">
        <ul className="st-tips">
          <li>Drag a component from the palette onto the canvas.</li>
          <li>Drag from a port to another port. Compatible ports light up; incompatible ones dim and explain why.</li>
          <li>Drop on a component body to let the rules pick the best port.</li>
          <li>
            Press <kbd className="pl-kbd">?</kbd> for all keyboard shortcuts.
          </li>
        </ul>
      </Section>
    </>
  );
}

export function Inspector({ ctx, issues, readOnly, actions }: { ctx: EngineContext; issues: readonly Issue[]; readOnly: boolean; actions: StudioActions }) {
  const selection = useStudioStore((s) => s.selection);
  const connection = useStudioStore((s) =>
    s.selection.nodes.length === 0 && s.selection.edges.length === 1
      ? s.history.present.connections.find((c) => c.connection_id === s.selection.edges[0])
      : undefined,
  );
  let body: ReactNode;
  if (selection.nodes.length === 1 && selection.edges.length === 0) {
    body = <NodeInspector key={selection.nodes[0]} assetId={selection.nodes[0]!} ctx={ctx} issues={issues} readOnly={readOnly} />;
  } else if (connection) {
    body = <EdgeInspector key={connection.connection_id} connection={connection} ctx={ctx} readOnly={readOnly} />;
  } else if (selection.nodes.length || selection.edges.length) {
    body = <MultiInspector actions={actions} readOnly={readOnly} />;
  } else {
    body = <AssemblySummary />;
  }
  return <div className="st-inspector">{body}</div>;
}
