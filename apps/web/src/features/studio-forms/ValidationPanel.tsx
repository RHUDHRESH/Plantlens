import type { ValidationIssue } from "../../app/store/studio";

interface ValidationPanelProps {
  issues: ValidationIssue[];
}

export function ValidationPanel({ issues }: ValidationPanelProps) {
  const errors = issues.filter((i) => i.severity !== "warning");
  const warnings = issues.filter((i) => i.severity === "warning");

  return (
    <aside className="validation-panel" aria-label="Validation">
      <h3>Validation</h3>
      {errors.length === 0 && warnings.length === 0 ? (
        <p className="validation-panel__ok">No blocking issues.</p>
      ) : (
        <ul className="validation-panel__list">
          {errors.map((issue, idx) => (
            <li key={`e-${idx}`} className="validation-panel__error">
              <strong>{issue.message}</strong>
              <span>Fix: {issue.fix}</span>
            </li>
          ))}
          {warnings.map((issue, idx) => (
            <li key={`w-${idx}`} className="validation-panel__warn">
              {issue.message} — {issue.fix}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}