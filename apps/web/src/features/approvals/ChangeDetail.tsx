import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, RotateCcw } from "lucide-react";
import { useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import type { ChangeRequest } from "../../api/v2";
import { submitChange } from "../../api/v2";
import { useCausalGraph } from "../../api/queries";
import { ENGINEER_ROLES, useCan } from "../../app/session";
import { Button, ErrorNotice, Panel } from "../../components/ui/primitives";
import { ChangeGraphPreview } from "./ChangeGraphPreview";
import { KindCounts } from "./EntityDiffView";
import { EntityDiffView } from "./EntityDiffView";
import { ReviewForm } from "./ReviewForm";
import { ValidationBlock } from "./ValidationBlock";
import { describeOp, diffTotals, formatTime, isOutdated, OP_VERB } from "./diffFormat";
import type { EdgeLike } from "./diffFormat";
import { useEntityLookup, useUnitFor } from "./engData";
import { RevChip, SourceTag } from "./engUi";
import type { Decision } from "./reviewModel";

const STATUS_TEXT: Record<ChangeRequest["status"], string> = {
  pending: "Pending review",
  stale: "Stale",
  deployed: "Deployed",
  rejected: "Rejected",
  failed: "Failed",
};

export function StatusTag({ status }: { status: ChangeRequest["status"] }) {
  return <span className={`eng-state eng-state--${status}`}>{STATUS_TEXT[status]}</span>;
}

function patternIdFromRef(ref: string | null): string | null {
  if (!ref) return null;
  return ref.split("@")[0] ?? null;
}

export function ChangeDetail({
  change,
  latestRev,
  onReviewed,
  onResubmitted,
}: {
  change: ChangeRequest;
  latestRev: number | null | undefined;
  onReviewed?: ((r: { decision: Decision; change: ChangeRequest }) => void) | undefined;
  onResubmitted?: ((change: ChangeRequest) => void) | undefined;
}) {
  const canEngineer = useCan(ENGINEER_ROLES);
  const unitFor = useUnitFor();
  const lookup = useEntityLookup();
  const graph = useCausalGraph();
  const client = useQueryClient();
  const edgesById = useMemo(() => new Map((graph.data?.edges ?? []).map((e) => [e.id, e])), [graph.data]);
  const lookupEdge = useCallback((id: string) => edgesById.get(id) as EdgeLike | undefined, [edgesById]);
  const resubmit = useMutation({
    mutationFn: () => submitChange(change.change_set),
    onSuccess: (data) => {
      void client.invalidateQueries({ queryKey: ["changes"] });
      onResubmitted?.(data.change);
    },
  });

  const outdated = isOutdated(change, latestRev);
  const stale = change.status === "stale" || outdated;
  const diff = change.preview?.diff ?? [];
  const totals = diffTotals(diff);
  const patternId = change.source === "pattern_library" ? patternIdFromRef(change.source_ref) : null;

  return (
    <article className="eng-detail" aria-labelledby="change-title">
      <header className="eng-detail__head">
        <div className="eng-detail__row">
          <StatusTag status={change.status} />
          <SourceTag source={change.source} />
          {change.source_ref ? (
            patternId ? (
              <Link className="eng-ref pl-mono" to={`/eng/library/${encodeURIComponent(patternId)}`}>
                {change.source_ref}
                <ExternalLink aria-hidden />
              </Link>
            ) : (
              <span className="eng-ref pl-mono">{change.source_ref}</span>
            )
          ) : null}
        </div>
        <h2 id="change-title" className="eng-detail__title">{change.title}</h2>
        {change.summary ? <p className="eng-detail__summary">{change.summary}</p> : null}
        <dl className="eng-meta">
          <div><dt>Author</dt><dd>{change.created_by} <span className="eng-muted">({change.created_by_role})</span></dd></div>
          <div><dt>Created</dt><dd className="pl-mono">{formatTime(change.created_at)}</dd></div>
          <div>
            <dt>{change.status === "deployed" ? "Base → result" : "Drafted against"}</dt>
            <dd>
              {change.status === "deployed" ? (
                <>
                  <RevChip rev={change.base_rev} /> <span className="eng-muted">→</span>{" "}
                  <RevChip rev={change.result_rev} active={change.result_rev === latestRev} />
                </>
              ) : (
                <>
                  {latestRev === change.base_rev ? (
                    <>
                      <RevChip rev={change.base_rev} active /> <span className="eng-muted">· current</span>
                    </>
                  ) : (
                    <>
                      <RevChip rev={change.base_rev} /> {latestRev != null ? <span className="eng-muted">· latest</span> : null}{" "}
                      {latestRev != null ? <RevChip rev={latestRev} /> : null}
                    </>
                  )}
                </>
              )}
            </dd>
          </div>
          <div><dt>Change id</dt><dd className="pl-mono eng-trunc" title={change.change_id}>{change.change_id.slice(0, 8)}</dd></div>
        </dl>
      </header>

      {stale ? (
        <div className="eng-banner eng-banner--warn" role="note">
          <AlertTriangle aria-hidden />
          <div>
            <strong>
              {change.status === "stale"
                ? `Stale: drafted against r${change.base_rev}, but the runtime moved on.`
                : `Drafted against r${change.base_rev}; r${latestRev} is now the latest revision.`}
            </strong>
            <p>
              Changes are never silently rebased. Re-submit against the current revision so the preview, diff and validation are
              recomputed{change.status === "pending" ? "; approving it as-is will be refused and mark it stale" : ""}.
            </p>
            {canEngineer ? (
              <Button size="sm" icon={<RotateCcw />} onClick={() => resubmit.mutate()} busy={resubmit.isPending}>
                Re-submit against r{latestRev ?? "current"}
              </Button>
            ) : null}
            {resubmit.error ? <ErrorNotice error={resubmit.error} /> : null}
          </div>
        </div>
      ) : null}

      <Panel title="Validation">
        <ValidationBlock preview={change.preview} />
      </Panel>

      <Panel
        title="Changes"
        actions={<KindCounts counts={totals} />}
      >
        <ChangeGraphPreview diff={diff} lookupEdge={lookupEdge} />
        <EntityDiffView diff={diff} unitFor={unitFor} lookup={lookup} emptyText="The preview recorded no entity changes." />
        <details className="eng-ops">
          <summary>Proposed operations ({change.change_set.ops.length}) with rationale</summary>
          <ol>
            {change.change_set.ops.map((op, i) => (
              <li key={i}>
                <span className="eng-ops__verb">{OP_VERB[op.op]?.verb ?? op.op}</span>{" "}
                <span className="pl-mono">{describeOp(op, unitFor)}</span>
                {op.rationale ? <div className="eng-muted">{op.rationale}</div> : null}
              </li>
            ))}
          </ol>
        </details>
      </Panel>

      <Panel title={change.status === "pending" ? "Review" : "Review record"}>
        {change.status === "pending" ? (
          <ReviewForm key={change.change_id} change={change} latestRev={latestRev} onReviewed={onReviewed} />
        ) : change.reviewed_by ? (
          <div className="eng-record">
            <p>
              <strong>{change.reviewed_by}</strong> <span className="eng-muted">· {formatTime(change.reviewed_at)}</span>
            </p>
            {change.review_comment ? <blockquote className="eng-quote">{change.review_comment}</blockquote> : null}
            {change.status === "deployed" ? (
              <p>
                Deployed as <RevChip rev={change.result_rev} active={change.result_rev === latestRev} /> · edges{" "}
                {change.approve_edges ? "admitted to the runtime" : "stored unapproved"}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="eng-muted">Not reviewed.</p>
        )}
      </Panel>
    </article>
  );
}
