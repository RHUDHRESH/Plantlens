import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Eye, EyeOff, RefreshCw, Send, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { InstantiationResult, PatternDetail, PatternLibrarySummary, RoleDefinition } from "../../api/v2";
import { useInstantiatePattern } from "../../api/queries";
import { EquipmentSymbol, symbolForAssetType } from "../../components/symbols";
import { Button, EmptyState, ErrorNotice, IconButton } from "../../components/ui/primitives";
import { KindMark } from "../approvals/EntityDiffView";
import { describeOp, groupOps, OP_VERB } from "../approvals/diffFormat";
import { focusContent } from "../approvals/engUi";
import { useCompiledIndexes, useUnitFor } from "../approvals/engData";
import type { AssetInfo } from "../approvals/engData";
import { ambiguousRoles, bindingRows, unobservableRoles, explicitBindings, hasPendingChoices, METHOD_TEXT, previewState } from "./bindings";

function BindingsTable({
  result,
  pattern,
  choices,
  onChoose,
}: {
  result: InstantiationResult;
  pattern: PatternDetail;
  choices: Record<string, string>;
  onChoose: (role: string, tag: string) => void;
}) {
  const rows = bindingRows(result, pattern.required_roles, choices);
  return (
    <table className="pl-table plib-bind">
      <thead>
        <tr>
          <th scope="col">Role</th>
          <th scope="col">Bound tag</th>
          <th scope="col">How it was bound</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.role} className={`plib-bind__row plib-bind__row--${r.method}`}>
            <th scope="row">
              <span className="pl-mono">{r.role}</span>
              {r.required ? <span className="plib-req">required</span> : null}
            </th>
            <td>
              {r.method === "ambiguous" || (r.method === "explicit" && r.candidates.length) ? (
                <label className="plib-bind__choose">
                  <span className="eng-sr-only">Tag for {r.role}</span>
                  <select className="pl-select" value={r.choice ?? r.tagId ?? ""} onChange={(e) => onChoose(r.role, e.target.value)}>
                    <option value="">Choose one of {r.candidates.length} tags…</option>
                    {r.candidates.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              ) : r.tagId ? (
                <span className="pl-mono">{r.tagId}</span>
              ) : (
                <span className="eng-muted">— not instrumented</span>
              )}
            </td>
            <td>
              <span className={`plib-method plib-method--${r.method}`}>
                {r.method === "ambiguous" ? <AlertTriangle aria-hidden /> : null}
                {METHOD_TEXT[r.method] ?? r.method}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GapCard({ missing, roles, assetId }: { missing: string[]; roles: RoleDefinition[]; assetId: string }) {
  const defs = new Map(roles.map((r) => [r.role, r]));
  return (
    <div className="eng-banner eng-banner--warn plib-gap" role="note">
      <EyeOff aria-hidden />
      <div>
        <strong>Observability gap — this failure mode cannot be detected on {assetId} today.</strong>
        <p>No change set was drafted. Add instrumentation for the required role{missing.length > 1 ? "s" : ""} below, map the tag in the tag map, then preview again.</p>
        <ul className="plib-gap__list">
          {missing.map((role) => {
            const d = defs.get(role);
            return (
              <li key={role}>
                <span className="pl-mono">{role}</span>
                {d ? (
                  <span>
                    {" "}— add a sensor measuring <em>{d.quantity}</em>
                    {d.units.length ? <> in <span className="pl-mono">{d.units.join(" / ")}</span></> : null}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function ChangeSetPreview({ result }: { result: InstantiationResult }) {
  const unitFor = useUnitFor();
  const groups = groupOps(result.change_set);
  if (!result.change_set) return null;
  return (
    <div className="plib-cs">
      <p className="eng-muted">{result.change_set.summary}</p>
      {groups.map((g) => (
        <section key={g.key} className="plib-cs__group">
          <h4 className="eng-subhead">
            {g.label} <span className="plib-cs__n">{g.ops.length}</span>
          </h4>
          <ul className="eng-diff__list">
            {g.ops.map((op, i) => (
              <li key={i} className={`eng-diff__item eng-diff__item--${OP_VERB[op.op].kind}`}>
                <div className="plib-cs__op">
                  <KindMark kind={OP_VERB[op.op].kind} />
                  <div className="plib-cs__text">
                    <span className="plib-cs__verb">{OP_VERB[op.op].verb}</span>
                    <span className="pl-mono">{describeOp(op, unitFor)}</span>
                    {op.rationale ? <span className="eng-muted plib-cs__why">{op.rationale}</span> : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function assetsForLibrary(assets: readonly AssetInfo[], library: Pick<PatternLibrarySummary, "asset_type_aliases"> | undefined, showAll: boolean): AssetInfo[] {
  if (showAll || !library) return [...assets];
  return assets.filter((a) => a.type && library.asset_type_aliases.includes(a.type));
}

export function ApplyToAssetDialog({
  open,
  onOpenChange,
  pattern,
  library,
  roles,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pattern: PatternDetail;
  library: PatternLibrarySummary | undefined;
  roles: RoleDefinition[];
  onSubmitted: (changeId: string, title: string) => void;
}) {
  const indexes = useCompiledIndexes();
  const preview = useInstantiatePattern();
  const submit = useInstantiatePattern();
  const [showAll, setShowAll] = useState(false);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [result, setResult] = useState<InstantiationResult | null>(null);

  const assets = useMemo(() => assetsForLibrary(indexes.data?.assets ?? [], library, showAll), [indexes.data, library, showAll]);

  const runPreview = (id: string, bindings: Record<string, string>) => {
    preview.mutate(
      { patternId: pattern.pattern_id, assetId: id, submit: false, ...(Object.keys(bindings).length ? { bindings } : {}) },
      {
        onSuccess: (data) => {
          setResult(data.result);
          setChoices({});
        },
      },
    );
  };

  const pickAsset = (id: string) => {
    setAssetId(id);
    setResult(null);
    setChoices({});
    submit.reset();
    runPreview(id, {});
  };

  const state = result ? previewState(result, choices) : null;
  const pending = hasPendingChoices(result, choices);
  const ambiguous = ambiguousRoles(result);

  const doSubmit = () => {
    if (!assetId || !result) return;
    const bindings = explicitBindings(result, {});
    submit.mutate(
      { patternId: pattern.pattern_id, assetId, submit: true, ...(Object.keys(bindings).length ? { bindings } : {}) },
      {
        onSuccess: (data) => {
          if (data.change) {
            onSubmitted(data.change.change_id, data.change.title);
            onOpenChange(false);
          }
        },
      },
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="pl-dialog-overlay" />
        <Dialog.Content className="plib-drawer" aria-describedby="plib-apply-desc" onOpenAutoFocus={focusContent} tabIndex={-1}>
          <header className="plib-drawer__head">
            <div>
              <Dialog.Title className="pl-dialog__title">Apply pattern to an asset</Dialog.Title>
              <Dialog.Description id="plib-apply-desc" className="pl-dialog__desc">
                <strong>{pattern.title}</strong> <span className="pl-mono">{pattern.pattern_id}@{pattern.version}</span>. The preview is a
                draft: nothing reaches the runtime until an engineer approves it in Approvals.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <IconButton label="Close" icon={<X />} />
            </Dialog.Close>
          </header>

          <div className="plib-drawer__body">
            <section className="plib-step" aria-labelledby="plib-step1">
              <h3 id="plib-step1" className="plib-step__title"><span className="plib-step__n">1</span> Pick the asset</h3>
              {indexes.error ? <ErrorNotice error={indexes.error} /> : null}
              <div className="plib-assets" role="radiogroup" aria-label="Asset">
                {assets.map((a) => (
                  <label key={a.id} className={`plib-asset${assetId === a.id ? " is-on" : ""}`}>
                    <input type="radio" name="asset" value={a.id} checked={assetId === a.id} onChange={() => pickAsset(a.id)} />
                    <EquipmentSymbol kind={symbolForAssetType(a.type)} size={28} />
                    <span className="plib-asset__text">
                      <strong className="pl-mono">{a.id}</strong>
                      <span>{a.display_name ?? a.type}</span>
                    </span>
                  </label>
                ))}
              </div>
              {!assets.length && !indexes.isLoading ? (
                <p className="eng-muted">
                  No asset in this plant is typed as{" "}
                  {library?.asset_type_aliases.length ? <span className="pl-mono">{library.asset_type_aliases.join(", ")}</span> : `a ${library?.display_name ?? "matching component"} (the library has no asset-type alias)`}.
                </p>
              ) : null}
              <button type="button" className="plib-linkbtn" onClick={() => setShowAll((v) => !v)} aria-pressed={showAll}>
                {showAll ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                {showAll ? "Only show matching asset types" : "Show all assets (type mismatch allowed)"}
              </button>
            </section>

            {assetId ? (
              <section className="plib-step" aria-labelledby="plib-step2" aria-busy={preview.isPending}>
                <h3 id="plib-step2" className="plib-step__title"><span className="plib-step__n">2</span> Review role bindings</h3>
                {preview.error ? <ErrorNotice error={preview.error} /> : null}
                {preview.isPending && !result ? <EmptyState title="Binding roles to tags…" /> : null}
                {result ? (
                  <>
                    <BindingsTable
                      result={result}
                      pattern={pattern}
                      choices={choices}
                      onChoose={(role, tag) => setChoices((c) => ({ ...c, [role]: tag }))}
                    />
                    {ambiguous.length ? (
                      <p className="plib-hint">
                        <AlertTriangle aria-hidden /> {ambiguous.length} role{ambiguous.length > 1 ? "s match" : " matches"} several tags. PlantLens never
                        guesses: choose the tag, then re-preview.
                      </p>
                    ) : null}
                    {pending ? (
                      <Button icon={<RefreshCw />} onClick={() => runPreview(assetId, explicitBindings(result, choices))} busy={preview.isPending}>
                        Re-preview with my bindings
                      </Button>
                    ) : null}
                    {unobservableRoles(result).length ? <GapCard missing={unobservableRoles(result)} roles={roles} assetId={assetId} /> : null}
                    {Object.keys(result.neighbours).length ? (
                      <div className="plib-neigh">
                        <h4 className="eng-subhead">Neighbours from plant connections</h4>
                        <dl>
                          {Object.entries(result.neighbours).map(([rel, ids]) => (
                            <div key={rel}>
                              <dt className="pl-mono">{rel}</dt>
                              <dd className="pl-mono">{ids.join(", ")}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ) : null}
                    {result.unresolved.length ? (
                      <div>
                        <h4 className="eng-subhead">Needs an engineer decision ({result.unresolved.length})</h4>
                        <ul className="plib-notes plib-notes--warn">
                          {result.unresolved.map((n) => <li key={n}>{n}</li>)}
                        </ul>
                      </div>
                    ) : null}
                    {result.notes.length ? (
                      <div>
                        <h4 className="eng-subhead">Notes</h4>
                        <ul className="plib-notes">
                          {result.notes.map((n) => <li key={n}>{n}</li>)}
                        </ul>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </section>
            ) : null}

            {result?.change_set ? (
              <section className="plib-step" aria-labelledby="plib-step3">
                <h3 id="plib-step3" className="plib-step__title"><span className="plib-step__n">3</span> Drafted change set</h3>
                <ChangeSetPreview result={result} />
              </section>
            ) : null}
          </div>

          <footer className="plib-drawer__foot">
            {submit.error ? <ErrorNotice error={submit.error} /> : null}
            <span className="eng-muted plib-drawer__status">
              {!result
                ? "Pick an asset to preview."
                : state === "gap"
                  ? "Nothing to submit: required roles are not observable."
                  : state === "needs_resolution"
                    ? pending
                      ? "Re-preview with your bindings before submitting."
                      : "Choose a tag for each ambiguous required role."
                    : `${result.change_set?.ops.length ?? 0} operation${result.change_set?.ops.length === 1 ? "" : "s"} ready for review.`}
            </span>
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant="primary" icon={<Send />} disabled={state !== "ready"} busy={submit.isPending} onClick={doSubmit}>
              Submit for review
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
