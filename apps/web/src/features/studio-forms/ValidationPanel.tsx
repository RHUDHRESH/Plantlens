import { CircleCheck } from "lucide-react";
import { PriorityGlyph } from "../../components/ui/primitives";
import type { StatusKind } from "../../components/ui/primitives";
import type { StudioDraftFamily, StudioDraftIssue } from "./studioDraftTypes";

interface ValidationPanelProps {
  issues: StudioDraftIssue[];
  selectedFamily?: StudioDraftFamily | null;
  selectedTargetId?: string | null;
  onSelectIssue?: (issue: StudioDraftIssue) => void;
}

const SEVERITY_LABELS = {
  error: "Errors",
  warning: "Warnings",
  info: "Info",
} as const;

const SEVERITY_STATUS: Record<StudioDraftIssue["severity"], StatusKind> = {
  error: "critical",
  warning: "medium",
  info: "low",
};

export function ValidationPanel({
  issues,
  selectedFamily,
  selectedTargetId,
  onSelectIssue,
}: ValidationPanelProps) {
  const scoped =
    selectedFamily && selectedTargetId
      ? issues.filter((i) => i.family === selectedFamily && i.targetId === selectedTargetId)
      : selectedFamily
        ? issues.filter((i) => i.family === selectedFamily)
        : issues;

  const errors = scoped.filter((i) => i.severity === "error");
  const warnings = scoped.filter((i) => i.severity === "warning");
  const info = scoped.filter((i) => i.severity === "info");

  function renderGroup(severity: StudioDraftIssue["severity"], group: StudioDraftIssue[]) {
    if (group.length === 0) return null;
    return (
      <section key={severity} className="sf-val__group">
        <h4 className="sf-val__group-title">
          {SEVERITY_LABELS[severity]} ({group.length})
        </h4>
        <ul className="sf-val__list">
          {group.map((issue) => {
            const body = (
              <>
                <PriorityGlyph status={SEVERITY_STATUS[severity]} size={11} title={severity} />
                <span className="sf-val__text">
                  <span>{issue.message}</span>
                  {issue.fixHint ? <span className="sf-val__fix">Fix: {issue.fixHint}</span> : null}
                </span>
              </>
            );
            return (
              <li key={issue.id}>
                {onSelectIssue && issue.targetId ? (
                  <button type="button" className="sf-val__issue" data-severity={severity} onClick={() => onSelectIssue(issue)}>
                    {body}
                  </button>
                ) : (
                  <div className="sf-val__issue" data-severity={severity}>
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <aside className="sf-val" aria-label="Validation">
      <div className="sf-val__head">
        <h3 className="sf-val__title">Validation</h3>
        <span className="sf-val__counts">
          {errors.length} error · {warnings.length} warning · {info.length} info
        </span>
      </div>
      {scoped.length === 0 ? (
        <p className="sf-val__ok">
          <CircleCheck aria-hidden /> No issues in the current scope.
        </p>
      ) : (
        <div className="sf-val__body">
          {renderGroup("error", errors)}
          {renderGroup("warning", warnings)}
          {renderGroup("info", info)}
        </div>
      )}
    </aside>
  );
}
