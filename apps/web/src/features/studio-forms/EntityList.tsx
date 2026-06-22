import type { StudioDraftFamily, StudioDraftIssue } from "./studioDraftTypes";
import { entityIdFromRecord, entityLabelFromRecord } from "./studioSelectors";

interface EntityListProps {
  family: StudioDraftFamily;
  items: Array<Record<string, unknown>>;
  selectedTargetId: string | null;
  issues: StudioDraftIssue[];
  familyDirty: boolean;
  onSelect: (targetId: string) => void;
}

export function EntityList({
  family,
  items,
  selectedTargetId,
  issues,
  familyDirty,
  onSelect,
}: EntityListProps) {
  const issueCountByTarget = new Map<string, number>();
  for (const issue of issues) {
    if (issue.family !== family || !issue.targetId) continue;
    issueCountByTarget.set(issue.targetId, (issueCountByTarget.get(issue.targetId) ?? 0) + 1);
  }

  return (
    <aside className="studio-form-shell__entity-list" aria-label="Entity list">
      {familyDirty ? (
        <span className="studio-dirty-badge" title="Unsaved local edits in this family">
          Draft modified
        </span>
      ) : null}
      <ul>
        {items.map((item) => {
          const id = entityIdFromRecord(family, item);
          const label = entityLabelFromRecord(family, item);
          const issueCount = issueCountByTarget.get(id) ?? 0;
          const selected = selectedTargetId === id;
          return (
            <li key={id}>
              <button
                type="button"
                className={selected ? "studio-entity-list__item studio-entity-list__item--active" : "studio-entity-list__item"}
                onClick={() => onSelect(id)}
                aria-current={selected ? "true" : undefined}
              >
                <span className="studio-entity-list__label">{label}</span>
                <span className="studio-entity-list__id">{id}</span>
                {issueCount > 0 ? (
                  <span className="studio-entity-list__badge" title={`${issueCount} validation issue(s)`}>
                    {issueCount}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {items.length === 0 ? <p className="studio-entity-list__empty">No entities in this draft family.</p> : null}
    </aside>
  );
}