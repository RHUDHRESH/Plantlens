import type { PreviewDiffItem } from "./previewDiff";

interface PreviewDiffPanelProps {
  diffItems: PreviewDiffItem[];
}

const CHANGE_LABELS = {
  added: "Added",
  removed: "Removed",
  changed: "Changed",
  unchanged: "Unchanged",
} as const;

export function PreviewDiffPanel({ diffItems }: PreviewDiffPanelProps) {
  const counts = {
    added: diffItems.filter((d) => d.change === "added").length,
    removed: diffItems.filter((d) => d.change === "removed").length,
    changed: diffItems.filter((d) => d.change === "changed").length,
    unchanged: diffItems.filter((d) => d.change === "unchanged").length,
  };

  const grouped = (["added", "removed", "changed", "unchanged"] as const).map((change) => ({
    change,
    items: diffItems.filter((d) => d.change === change),
  }));

  return (
    <aside className="preview-diff-panel" aria-label="Preview diff">
      <h3>Diff vs compiled HMI</h3>
      <p className="preview-diff-panel__note">
        Diff compares local preview against currently loaded compiled HMI when available.
      </p>
      {diffItems.length === 0 ? (
        <p className="preview-diff-panel__empty">No compiled bundle loaded — diff unavailable.</p>
      ) : (
        <>
          <p className="preview-diff-panel__counts">
            {counts.added} added · {counts.removed} removed · {counts.changed} changed ·{" "}
            {counts.unchanged} unchanged
          </p>
          {grouped.map(
            ({ change, items }) =>
              items.length > 0 && (
                <section key={change} className="preview-diff-panel__group">
                  <h4>
                    {CHANGE_LABELS[change]} ({items.length})
                  </h4>
                  <ul>
                    {items.map((item) => (
                      <li key={`${item.kind}:${item.id}:${item.change}`}>
                        <span className="preview-diff-panel__kind">{item.kind}</span>
                        <span className="preview-diff-panel__label">{item.label}</span>
                        <span className="preview-diff-panel__detail">{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ),
          )}
        </>
      )}
    </aside>
  );
}