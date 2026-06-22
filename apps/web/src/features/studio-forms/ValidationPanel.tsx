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

  const counts = { error: errors.length, warning: warnings.length, info: info.length };

  function renderGroup(severity: StudioDraftIssue["severity"], group: StudioDraftIssue[]) {
    if (group.length === 0) return null;
    return (
      <section key={severity} className="studio-validation-panel__group">
        <h4>
          {SEVERITY_LABELS[severity]} ({group.length})
        </h4>
        <ul>
          {group.map((issue) => (
            <li key={issue.id}>
              {onSelectIssue ? (
                <button
                  type="button"
                  className={`studio-validation-panel__issue studio-validation-panel__issue--${severity}`}
                  onClick={() => onSelectIssue(issue)}
                >
                  <span>{issue.message}</span>
                  {issue.fixHint ? <span className="studio-validation-panel__hint">{issue.fixHint}</span> : null}
                </button>
              ) : (
                <div className={`studio-validation-panel__issue studio-validation-panel__issue--${severity}`}>
                  <span>{issue.message}</span>
                  {issue.fixHint ? <span className="studio-validation-panel__hint">{issue.fixHint}</span> : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <aside className="studio-validation-panel" aria-label="Validation">
      <h3>Validation</h3>
      <p className="studio-validation-panel__counts">
        {counts.error} error · {counts.warning} warning · {counts.info} info
      </p>
      {scoped.length === 0 ? (
        <p className="studio-validation-panel__ok">No issues in current scope.</p>
      ) : (
        <>
          {renderGroup("error", errors)}
          {renderGroup("warning", warnings)}
          {renderGroup("info", info)}
        </>
      )}
    </aside>
  );
}