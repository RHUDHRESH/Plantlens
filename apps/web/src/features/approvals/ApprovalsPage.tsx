import { AlertTriangle, CheckCircle2, CircleAlert, CircleSlash, Inbox } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { ChangeRequest } from "../../api/v2";
import { useActiveRevision, useChange, useChanges } from "../../api/queries";
import { EmptyState, ErrorNotice, PageHeader } from "../../components/ui/primitives";
import { ChangeDetail } from "./ChangeDetail";
import { formatRelative, isOutdated, tabForChange, validationStatus } from "./diffFormat";
import type { QueueTab } from "./diffFormat";
import { RevChip, SourceTag, Toast } from "./engUi";
import type { ToastMessage } from "./engUi";
import "./approvals.css";

const TABS: { id: QueueTab; label: string; empty: string }[] = [
  { id: "pending", label: "Pending", empty: "No drafts are waiting for review." },
  { id: "stale", label: "Stale", empty: "No stale drafts. Stale drafts were written against an older revision." },
  { id: "deployed", label: "Deployed", empty: "Nothing deployed through the pipeline yet." },
  { id: "rejected", label: "Rejected", empty: "No rejected drafts." },
];

function ValidationIcon({ change }: { change: ChangeRequest }) {
  const v = validationStatus(change);
  if (v === "valid") return <span className="eng-vstat" title="Preview validates"><CheckCircle2 aria-hidden /> <span>Valid</span></span>;
  if (v === "invalid") return <span className="eng-vstat eng-vstat--bad" title="Preview fails validation"><CircleAlert aria-hidden /> <span>Invalid</span></span>;
  if (v === "does_not_apply") return <span className="eng-vstat eng-vstat--bad" title="Does not apply"><CircleSlash aria-hidden /> <span>Does not apply</span></span>;
  return <span className="eng-vstat">—</span>;
}

function QueueRow({ change, selected, latestRev, tab }: { change: ChangeRequest; selected: boolean; latestRev: number | null | undefined; tab: QueueTab }) {
  const outdated = isOutdated(change, latestRev);
  return (
    <li>
      <Link
        to={`/eng/approvals/${change.change_id}?tab=${tab}`}
        className={`eng-qrow${selected ? " is-selected" : ""}`}
        aria-current={selected ? "true" : undefined}
      >
        <span className="eng-qrow__title">{change.title}</span>
        <span className="eng-qrow__meta">
          <SourceTag source={change.source} compact />
          <span>{change.created_by}</span>
          <span aria-hidden>·</span>
          <span title={change.created_at ?? ""}>{formatRelative(change.created_at)}</span>
        </span>
        <span className="eng-qrow__meta">
          <span className="eng-qrow__revs">
            <RevChip rev={change.base_rev} label="base" />
            {change.status === "deployed" ? <RevChip rev={change.result_rev} label="→" active={change.result_rev === latestRev} /> : null}
          </span>
          {outdated || change.status === "stale" ? (
            <span className="eng-stale-tag">
              <AlertTriangle aria-hidden /> {latestRev != null ? `r${latestRev} is latest` : "stale"}
            </span>
          ) : null}
          <span className="eng-qrow__spacer" />
          <ValidationIcon change={change} />
        </span>
      </Link>
    </li>
  );
}

export function ApprovalsPage() {
  const { changeId } = useParams<{ changeId?: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const all = useChanges();
  const active = useActiveRevision();
  const latestRev = active.data?.latest_revision?.rev ?? null;
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const dismiss = useCallback(() => setToast(null), []);

  const byTab = useMemo(() => {
    const out: Record<QueueTab, ChangeRequest[]> = { pending: [], stale: [], deployed: [], rejected: [] };
    for (const c of all.data?.changes ?? []) out[tabForChange(c)].push(c);
    return out;
  }, [all.data]);

  const fromList = (all.data?.changes ?? []).find((c) => c.change_id === changeId);
  const single = useChange(changeId && !fromList ? changeId : null);
  const byId = fromList ?? single.data?.change ?? null;
  const requestedTab = params.get("tab") as QueueTab | null;
  const tab: QueueTab = requestedTab && TABS.some((t) => t.id === requestedTab) ? requestedTab : byId ? tabForChange(byId) : "pending";
  const rows = byTab[tab];
  // Without an id in the URL, open the first change of the tab so the reviewer lands on work.
  const selected = byId ?? (!changeId ? (rows[0] ?? null) : null);

  const setTab = (next: QueueTab) => {
    const first = byTab[next][0];
    navigate(first ? `/eng/approvals/${first.change_id}?tab=${next}` : `/eng/approvals?tab=${next}`);
  };

  const onTabKey = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = TABS[(index + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length]!;
    setTab(next.id);
    document.getElementById(`eng-tab-${next.id}`)?.focus();
  };

  return (
    <div className="pl-page eng-approvals">
      <PageHeader
        title="Approvals"
        description="Drafts from agents, the pattern library, Studio and engineers. Nothing reaches the runtime until an engineer approves it with a comment."
        meta={
          <>
            Latest revision <RevChip rev={latestRev} active />
          </>
        }
      />
      <div className="eng-split">
        <section className="eng-queue pl-panel" aria-label="Change queue">
          <div className="eng-tabs" role="tablist" aria-label="Queue">
            {TABS.map((t, i) => (
              <button
                key={t.id}
                id={`eng-tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                aria-controls="eng-queue-list"
                tabIndex={tab === t.id ? 0 : -1}
                className="eng-tab"
                onClick={() => setTab(t.id)}
                onKeyDown={(e) => onTabKey(e, i)}
              >
                {t.label}
                <span className="eng-tab__count">{byTab[t.id].length}</span>
              </button>
            ))}
          </div>
          <div id="eng-queue-list" role="tabpanel" aria-labelledby={`eng-tab-${tab}`} className="eng-queue__body">
            {all.error ? <ErrorNotice error={all.error} /> : null}
            {all.isLoading ? <EmptyState title="Loading changes…" /> : null}
            {!all.isLoading && !rows.length ? <EmptyState icon={<Inbox />} title={TABS.find((t) => t.id === tab)!.empty} /> : null}
            <ul className="eng-qlist">
              {rows.map((c) => (
                <QueueRow key={c.change_id} change={c} selected={c.change_id === selected?.change_id} latestRev={latestRev} tab={tab} />
              ))}
            </ul>
          </div>
        </section>
        <section className="eng-split__detail" aria-label="Change detail">
          {single.error ? <ErrorNotice error={single.error} /> : null}
          {selected ? (
            <ChangeDetail
              key={selected.change_id}
              change={selected}
              latestRev={latestRev}
              onReviewed={({ decision, change }) => {
                setToast({
                  id: Date.now(),
                  title: decision === "approve" ? `Approved — deployed as r${change.result_rev}` : "Change rejected",
                  body: decision === "approve" ? "The runtime now runs the new revision." : "Recorded with your comment.",
                });
                setParams({ tab: decision === "approve" ? "deployed" : "rejected" }, { replace: true });
              }}
              onResubmitted={(fresh) => {
                setToast({ id: Date.now(), title: "Re-submitted against the current revision", body: "Review the recomputed preview." });
                navigate(`/eng/approvals/${fresh.change_id}?tab=pending`);
              }}
            />
          ) : !single.isLoading ? (
            <EmptyState title="Select a change to review">Pick a draft from the queue to see its diff, validation and review form.</EmptyState>
          ) : null}
        </section>
      </div>
      <Toast toast={toast} onDismiss={dismiss} />
    </div>
  );
}
