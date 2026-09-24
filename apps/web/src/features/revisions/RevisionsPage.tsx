import { GitCommitVertical, History, RotateCcw, Undo2 } from "lucide-react";
import { useCallback, useId, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { RevisionSummary } from "../../api/v2";
import { useActiveRevision, useRevisions, useRollback } from "../../api/queries";
import { useSession } from "../../app/session";
import { Button, EmptyState, ErrorNotice, PageHeader, Panel } from "../../components/ui/primitives";
import { EntityDiffView, KindCounts } from "../approvals/EntityDiffView";
import { diffTotals, formatRelative, formatTime } from "../approvals/diffFormat";
import { useEntityLookup, useRevisionDiff, useUnitFor } from "../approvals/engData";
import { ConfirmDialog, CopyButton, RevChip, Toast } from "../approvals/engUi";
import type { ToastMessage } from "../approvals/engUi";
import { canRollback, isRollbackRevision, noteTitle, rollbackTarget, shortHash, validateRollbackReason } from "./revisionModel";
import "../approvals/approvals.css";
import "./revisions.css";

function RollbackDialog({
  target,
  latestRev,
  activeRev,
  open,
  onOpenChange,
  onDone,
}: {
  target: RevisionSummary;
  latestRev: number | null;
  activeRev: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (rev: number) => void;
}) {
  const rollback = useRollback();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const next = latestRev != null ? latestRev + 1 : null;
  const confirm = () => {
    const problem = validateRollbackReason(reason);
    setError(problem);
    if (problem) return;
    rollback.mutate(
      { toRev: target.rev, comment: reason.trim() },
      {
        onSuccess: (data) => {
          onOpenChange(false);
          onDone(data.rev);
        },
      },
    );
  };
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Roll back to r${target.rev}?`}
      description="Rollback never rewrites history."
      confirmLabel={`Deploy r${target.rev} as ${next ? `r${next}` : "a new revision"}`}
      confirmVariant="danger"
      busy={rollback.isPending}
      onConfirm={confirm}
    >
      <ul className="eng-consequences">
        <li>
          Creates a <strong>new</strong> revision {next ? <RevChip rev={next} /> : null} whose bundle is an exact copy of <RevChip rev={target.rev} />
          , and hot-deploys it{activeRev != null ? <> in place of <RevChip rev={activeRev} active /></> : null}.
        </li>
        <li>Every existing revision, including the one you leave, stays in the timeline and can be restored later.</li>
        <li>Pending drafts written against the current revision will become stale and need re-submitting.</li>
        <li>The reason is recorded in the audit ledger as <span className="pl-mono">runtime.rollback</span>.</li>
      </ul>
      <label className="pl-field rev-reason" htmlFor={id}>
        <span>Reason (required)</span>
        <textarea
          id={id}
          className="pl-textarea"
          value={reason}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          placeholder="e.g. New motor overload rule causes nuisance trips on start-up; reverting until thresholds are re-tuned."
          onChange={(e) => {
            setReason(e.target.value);
            if (error) setError(null);
          }}
        />
      </label>
      {error ? <p id={`${id}-err`} className="eng-field-error" style={{ marginTop: 6 }}>{error}</p> : null}
      {rollback.error ? <ErrorNotice error={rollback.error} /> : null}
    </ConfirmDialog>
  );
}

function RevisionDiff({ rev, revisions }: { rev: RevisionSummary; revisions: RevisionSummary[] }) {
  const unitFor = useUnitFor();
  const lookup = useEntityLookup();
  const [against, setAgainst] = useState<number | null>(rev.parent_rev);
  const base = against;
  const diff = useRevisionDiff(base, base != null ? rev.rev : null);
  const selectId = useId();
  return (
    <Panel
      title={`Changes in r${rev.rev}`}
      actions={
        <>
          {diff.data ? <KindCounts counts={diffTotals(diff.data.diff)} /> : null}
          {rev.parent_rev != null || revisions.length > 1 ? (
            <label className="rev-against" htmlFor={selectId}>
              <span>compared with</span>
              <select id={selectId} className="pl-select" value={against ?? ""} onChange={(e) => setAgainst(e.target.value ? Number(e.target.value) : null)}>
                {revisions
                  .filter((r) => r.rev !== rev.rev)
                  .map((r) => (
                    <option key={r.rev} value={r.rev}>
                      r{r.rev}
                      {r.rev === rev.parent_rev ? " (parent)" : ""}
                    </option>
                  ))}
              </select>
            </label>
          ) : null}
        </>
      }
    >
      {base == null ? (
        <EmptyState title="First revision">r{rev.rev} was seeded from the authored bundle files; there is no parent to compare with.</EmptyState>
      ) : diff.error ? (
        <ErrorNotice error={diff.error} />
      ) : diff.isLoading ? (
        <EmptyState title="Computing diff…" />
      ) : diff.data?.identical ? (
        <EmptyState title={`r${rev.rev} is identical to r${base}`}>Same bundle hash — typical for a rollback that restored r{base}.</EmptyState>
      ) : diff.data ? (
        <EntityDiffView diff={diff.data.diff} unitFor={unitFor} lookup={lookup} />
      ) : null}
    </Panel>
  );
}

export function RevisionsPage() {
  const role = useSession((s) => s.role);
  const revisions = useRevisions();
  const active = useActiveRevision();
  const activeRev = active.data?.runtime.bundle_rev ?? null;
  const list = revisions.data?.revisions ?? [];
  const latestRev = list[0]?.rev ?? null;
  const [params, setParams] = useSearchParams();
  const selectedRev = Number(params.get("rev")) || activeRev || latestRev;
  const selected = list.find((r) => r.rev === selectedRev) ?? list[0];
  const [rollbackTo, setRollbackTo] = useState<RevisionSummary | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const dismiss = useCallback(() => setToast(null), []);
  const isAdmin = role === "admin";

  return (
    <div className="pl-page">
      <PageHeader
        title="Revisions"
        description="Every approved change and every rollback is an immutable, numbered bundle snapshot. The runtime runs exactly one of them."
        meta={
          <>
            Live <RevChip rev={activeRev} active />
            {active.data?.runtime.source === "files" ? <span>(authored files — no pipeline revision deployed yet)</span> : null}
          </>
        }
      />
      {!isAdmin ? (
        <div className="eng-banner" role="note">
          <History aria-hidden />
          <div>
            <strong>Read-only for {role}s.</strong> Only administrators can roll back.
          </div>
        </div>
      ) : null}
      {revisions.error ? <ErrorNotice error={revisions.error} /> : null}
      <div className="eng-split rev-split">
        <Panel title="Timeline" padded={false} className="rev-timeline-panel">
          {revisions.isLoading ? <EmptyState title="Loading revisions…" /> : null}
          {!revisions.isLoading && !list.length ? (
            <EmptyState icon={<History />} title="No revisions yet">The first approved change creates r1 from the authored files.</EmptyState>
          ) : null}
          <ol className="rev-timeline">
            {list.map((r) => {
              const isActive = r.rev === activeRev;
              const note = noteTitle(r.note);
              const rb = isRollbackRevision(r);
              const gate = canRollback(role, r.rev, activeRev);
              return (
                <li key={r.rev} className={`rev-item${isActive ? " is-active" : ""}${r.rev === selected?.rev ? " is-selected" : ""}`}>
                  <span className="rev-item__rail" aria-hidden>
                    <span className="rev-item__dot">{rb ? <Undo2 /> : <GitCommitVertical />}</span>
                  </span>
                  <div className="rev-item__body">
                    <button
                      type="button"
                      className="rev-item__select"
                      aria-pressed={r.rev === selected?.rev}
                      onClick={() => setParams({ rev: String(r.rev) }, { replace: true })}
                    >
                      <span className="rev-item__head">
                        <RevChip rev={r.rev} active={isActive} />
                        {isActive ? <span className="rev-live">Live</span> : null}
                        {rb ? <span className="rev-tag">rollback{rollbackTarget(r) ? ` of r${rollbackTarget(r)}` : ""}</span> : null}
                        <span className="rev-item__when" title={r.deployed_at ? `Deployed ${formatTime(r.deployed_at)}` : undefined}>
                          {r.deployed_at ? formatRelative(r.deployed_at) : "not deployed"}
                        </span>
                      </span>
                      <span className="rev-item__title">{note.title || "(no note)"}</span>
                      {note.comment ? <span className="rev-item__comment">“{note.comment}”</span> : null}
                    </button>
                    <div className="rev-item__meta">
                      <span>{r.created_by}</span>
                      <span className="rev-hash">
                        <span className="pl-mono" title={r.bundle_hash}>{shortHash(r.bundle_hash)}</span>
                        <CopyButton value={r.bundle_hash} label={`Copy bundle hash of r${r.rev}`} />
                      </span>
                      {r.source_change_id ? (
                        <Link className="eng-link" to={`/eng/approvals/${r.source_change_id}`}>source change</Link>
                      ) : null}
                      {isAdmin && gate.allowed ? (
                        <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={() => setRollbackTo(r)}>
                          Roll back to r{r.rev}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </Panel>
        <div className="eng-split__detail">
          {selected ? <RevisionDiff key={selected.rev} rev={selected} revisions={list} /> : null}
        </div>
      </div>
      {rollbackTo ? (
        <RollbackDialog
          target={rollbackTo}
          latestRev={latestRev}
          activeRev={activeRev}
          open={!!rollbackTo}
          onOpenChange={(o) => !o && setRollbackTo(null)}
          onDone={(rev) => {
            setToast({ id: Date.now(), title: `Rolled back — r${rev} is live`, body: `Bundle of r${rollbackTo.rev} redeployed as a new revision.` });
            setParams({ rev: String(rev) }, { replace: true });
          }}
        />
      ) : null}
      <Toast toast={toast} onDismiss={dismiss} />
    </div>
  );
}
