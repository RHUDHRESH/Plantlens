import type { PreviewCompileIssue } from "./previewTypes";

interface PreviewIssueListProps {
  issues: PreviewCompileIssue[];
  onSelectIssue?: (issue: PreviewCompileIssue) => void;
}

const GROUP_LABELS = {
  error: "Errors",
  warning: "Warnings",
  info: "Info",
} as const;

export function PreviewIssueList({ issues, onSelectIssue }: PreviewIssueListProps) {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const info = issues.filter((i) => i.severity === "info");

  function renderGroup(severity: PreviewCompileIssue["severity"], group: PreviewCompileIssue[]) {
    if (group.length === 0) return null;
    return (
      <section key={severity} className="preview-issue-list__group">
        <h4>
          {GROUP_LABELS[severity]} ({group.length})
        </h4>
        <ul>
          {group.map((issue) => (
            <li key={issue.id}>
              {onSelectIssue ? (
                <button type="button" className="preview-issue-list__item" onClick={() => onSelectIssue(issue)}>
                  <IssueContent issue={issue} />
                </button>
              ) : (
                <div className="preview-issue-list__item">
                  <IssueContent issue={issue} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <aside className="preview-issue-list" aria-label="Preview issues">
      <h3>Issues</h3>
      {issues.length === 0 ? (
        <p className="preview-issue-list__empty">No preview issues.</p>
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

function IssueContent({ issue }: { issue: PreviewCompileIssue }) {
  return (
    <>
      <span className="preview-issue-list__source">{issue.source}</span>
      <span className="preview-issue-list__family">{issue.family}</span>
      {issue.targetId ? <span className="preview-issue-list__target">{issue.targetId}</span> : null}
      <span className="preview-issue-list__message">{issue.message}</span>
    </>
  );
}