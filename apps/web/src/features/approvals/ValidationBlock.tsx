import { CheckCircle2, CircleAlert, Repeat } from "lucide-react";
import type { ChangeRequest } from "../../api/v2";

/** Validation result of the change preview: schema, compile (with fix), feedback loops introduced. */
export function ValidationBlock({ preview }: { preview: ChangeRequest["preview"] }) {
  if (!preview) return null;
  if (!preview.applies) {
    return (
      <div className="eng-validation eng-validation--bad" role="alert">
        <CircleAlert aria-hidden />
        <div>
          <strong>Does not apply to its base revision.</strong>
          <p className="pl-mono eng-validation__detail">{preview.error}</p>
          <p className="eng-muted">Fix: re-draft the change against the current revision (for pattern drafts, apply the pattern again).</p>
        </div>
      </div>
    );
  }
  const v = preview.validation;
  if (!v) return <p className="eng-muted">No validation result recorded for this change.</p>;
  return (
    <div className="eng-validation-stack">
      <div className={`eng-validation ${v.ok ? "eng-validation--ok" : "eng-validation--bad"}`}>
        {v.ok ? <CheckCircle2 aria-hidden /> : <CircleAlert aria-hidden />}
        <div>
          <strong>{v.ok ? "Resulting bundle validates" : "Resulting bundle fails validation"}</strong>
          <p className="eng-muted">
            JSON Schema (Draft 2020-12) · graph compile under the cycle policy · alarm tag and asset references.
            Graph hash <span className="pl-mono">{v.graph_hash}</span>
          </p>
        </div>
      </div>
      {v.schema_errors.length ? (
        <div>
          <h4 className="eng-subhead">Schema errors ({v.schema_errors.length})</h4>
          <ul className="eng-errlist">
            {v.schema_errors.map((e, i) => (
              <li key={i}>
                <span className="pl-mono eng-errlist__path">{e.doc}{e.path ? ` ${e.path}` : ""}</span>
                <span>{e.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {v.compile_errors.length ? (
        <div>
          <h4 className="eng-subhead">Compile errors ({v.compile_errors.length})</h4>
          <ul className="eng-errlist">
            {v.compile_errors.map((e, i) => (
              <li key={i}>
                <span className="pl-mono eng-errlist__path">{e.field}</span>
                <span>
                  {e.message}
                  {e.fix ? <em className="eng-errlist__fix"> Fix: {e.fix}</em> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {v.feedback_loops.length ? (
        <div>
          <h4 className="eng-subhead">Feedback loops in the resulting graph ({v.feedback_loops.length})</h4>
          <ul className="eng-loops">
            {v.feedback_loops.map((loop, i) => (
              <li key={i} className="eng-loop">
                <Repeat aria-hidden className="eng-loop__icon" />
                <span className="eng-loop__chain pl-mono">
                  {[...loop.members, loop.members[0]].map((m, j) => (
                    <span key={j}>
                      {j > 0 ? <span className="eng-loop__arrow" aria-hidden> → </span> : null}
                      {m}
                    </span>
                  ))}
                </span>
                {loop.loop_ids.length ? <span className="eng-loop__ids">loop {loop.loop_ids.join(", ")}</span> : null}
              </li>
            ))}
          </ul>
          <p className="eng-muted">Flagged loops are traversed once per diagnosis; unflagged cycles are refused by the compiler.</p>
        </div>
      ) : null}
    </div>
  );
}
