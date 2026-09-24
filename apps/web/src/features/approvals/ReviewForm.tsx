import { Check, X } from "lucide-react";
import { useId, useState } from "react";
import { Link } from "react-router-dom";
import type { ChangeRequest } from "../../api/v2";
import { useReviewChange } from "../../api/queries";
import { useSession } from "../../app/session";
import { Button, ErrorNotice } from "../../components/ui/primitives";
import { ConfirmDialog, RevChip } from "./engUi";
import { canReview, consequences, countOps, explainReviewError, validateReview } from "./reviewModel";
import type { Decision, ReviewDraft, ReviewErrors } from "./reviewModel";

export function ReviewForm({
  change,
  latestRev,
  onReviewed,
}: {
  change: ChangeRequest;
  latestRev: number | null | undefined;
  onReviewed?: ((result: { decision: Decision; change: ChangeRequest }) => void) | undefined;
}) {
  const role = useSession((s) => s.role);
  const review = useReviewChange();
  const [draft, setDraft] = useState<ReviewDraft>({ decision: null, comment: "", approveEdges: true });
  const [errors, setErrors] = useState<ReviewErrors>({});
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<{ decision: Decision; change: ChangeRequest } | null>(null);
  const commentId = useId();
  const edgesId = useId();
  const gate = canReview(role, change);
  const edges = countOps(change).edges;

  if (done) {
    return (
      <div className="eng-review-done" role="status">
        {done.decision === "approve" ? (
          <>
            <p>
              <Check aria-hidden className="eng-review-done__icon" /> Approved and deployed as{" "}
              <RevChip rev={done.change.result_rev} active />.
            </p>
            <p className="eng-links">
              {role === "admin" ? <Link to="/admin/revisions">Open revision history</Link> : null}
              <Link to="/ops/causal">See the live causal graph</Link>
              <Link to="/admin/audit">Audit entries</Link>
            </p>
          </>
        ) : (
          <p>
            <X aria-hidden className="eng-review-done__icon" /> Rejected. The draft stays in the Rejected tab with your comment.
          </p>
        )}
      </div>
    );
  }

  if (!gate.allowed) {
    return gate.reason ? <p className="eng-muted">{gate.reason}</p> : null;
  }

  const set = (patch: Partial<ReviewDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    if (Object.keys(errors).length) setErrors({});
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = validateReview(draft);
    setErrors(found);
    if (Object.keys(found).length) return;
    review.reset();
    setConfirming(true);
  };

  const confirm = () => {
    if (!draft.decision) return;
    review.mutate(
      { id: change.change_id, decision: draft.decision, comment: draft.comment.trim(), approve_edges: draft.decision === "approve" ? draft.approveEdges : false },
      {
        onSuccess: (data) => {
          setConfirming(false);
          const result = { decision: draft.decision!, change: data.change };
          setDone(result);
          onReviewed?.(result);
        },
        onError: () => setConfirming(false),
      },
    );
  };

  const explained = review.error ? explainReviewError(review.error) : null;

  return (
    <form className="eng-review" onSubmit={onSubmit} noValidate aria-label="Review this change">
      <fieldset className="eng-review__decision">
        <legend>Decision</legend>
        <div className="eng-decision" role="radiogroup" aria-label="Decision" aria-invalid={errors.decision ? true : undefined}>
          {(["approve", "reject"] as Decision[]).map((d) => (
            <label key={d} className={`eng-decision__opt eng-decision__opt--${d}${draft.decision === d ? " is-on" : ""}`}>
              <input type="radio" name="decision" value={d} checked={draft.decision === d} onChange={() => set({ decision: d })} />
              {d === "approve" ? <Check aria-hidden /> : <X aria-hidden />}
              {d === "approve" ? "Approve & deploy" : "Reject"}
            </label>
          ))}
        </div>
        {errors.decision ? <p className="eng-field-error">{errors.decision}</p> : null}
      </fieldset>

      <label className="pl-field" htmlFor={commentId}>
        <span>
          Review comment <span aria-hidden>*</span>
          <span className="eng-muted"> — required, written to the audit ledger</span>
        </span>
        <textarea
          id={commentId}
          className="pl-textarea"
          value={draft.comment}
          required
          aria-required="true"
          aria-invalid={errors.comment ? true : undefined}
          aria-describedby={errors.comment ? `${commentId}-err` : undefined}
          placeholder="What did you check? e.g. thresholds against the nameplate, edge direction against the P&ID."
          onChange={(e) => set({ comment: e.target.value })}
        />
      </label>
      {errors.comment ? (
        <p id={`${commentId}-err`} className="eng-field-error">
          {errors.comment}
        </p>
      ) : null}

      {draft.decision !== "reject" && edges > 0 ? (
        <div className="eng-check">
          <input
            id={edgesId}
            type="checkbox"
            checked={draft.approveEdges}
            onChange={(e) => set({ approveEdges: e.target.checked })}
          />
          <label htmlFor={edgesId}>
            <strong>Admit proposed edges to the runtime</strong>
            <span className="eng-muted">
              {" "}
              {edges > 1 ? `The ${edges} edges become` : "The edge becomes"} approved and the live causal engine traverses them. Unchecked, they are
              stored unapproved.
            </span>
          </label>
        </div>
      ) : null}

      {draft.decision !== "reject" && change.preview && (!change.preview.applies || change.preview.validation?.ok === false) ? (
        <p className="eng-field-error" role="note">
          This change fails validation, so approval will be refused. Reject it with a comment, or ask the author to re-draft it.
        </p>
      ) : null}
      {explained ? <ErrorNotice error={{ body: { message: explained.message, fix: explained.fix } }} /> : null}

      <div className="eng-review__actions">
        <Button type="submit" variant={draft.decision === "reject" ? "danger" : "primary"} busy={review.isPending}>
          {draft.decision === "reject" ? "Reject change…" : draft.decision === "approve" ? "Approve & deploy…" : "Submit review…"}
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={draft.decision === "reject" ? "Reject this change?" : `Approve and deploy as ${latestRev != null ? `r${latestRev + 1}` : "a new revision"}?`}
        description={change.title}
        confirmLabel={draft.decision === "reject" ? "Reject" : "Approve & deploy"}
        confirmVariant={draft.decision === "reject" ? "danger" : "primary"}
        busy={review.isPending}
        onConfirm={confirm}
      >
        <ul className="eng-consequences">
          {consequences(draft, change, latestRev).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <blockquote className="eng-quote">{draft.comment.trim()}</blockquote>
      </ConfirmDialog>
    </form>
  );
}
