import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { PriorityGlyph } from "../../components/ui/primitives";
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
  const [query, setQuery] = useState("");
  const issueByTarget = useMemo(() => {
    const m = new Map<string, { count: number; error: boolean }>();
    for (const issue of issues) {
      if (issue.family !== family || !issue.targetId) continue;
      const cur = m.get(issue.targetId) ?? { count: 0, error: false };
      m.set(issue.targetId, { count: cur.count + 1, error: cur.error || issue.severity === "error" });
    }
    return m;
  }, [issues, family]);

  const q = query.trim().toLowerCase();
  const rows = items
    .map((item) => ({ id: entityIdFromRecord(family, item), label: entityLabelFromRecord(family, item) }))
    .filter((r) => !q || r.id.toLowerCase().includes(q) || r.label.toLowerCase().includes(q));

  return (
    <aside className="sf-list" aria-label="Entity list">
      <div className="sf-list__head">
        <label className="sf-list__search">
          <Search aria-hidden />
          <input
            className="pl-input"
            type="search"
            placeholder={`Filter ${items.length}`}
            aria-label="Filter entities"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {familyDirty ? (
          <span className="sf-dirty" title="Unsaved local edits in this family">
            Modified
          </span>
        ) : null}
      </div>
      <ul className="sf-list__items">
        {rows.map(({ id, label }) => {
          const issue = issueByTarget.get(id);
          const selected = selectedTargetId === id;
          return (
            <li key={id}>
              <button
                type="button"
                className="sf-list__item"
                onClick={() => onSelect(id)}
                aria-current={selected ? "true" : undefined}
              >
                <span className="sf-list__label">{label}</span>
                <span className="sf-list__id">{id}</span>
                {issue ? (
                  <span className="sf-list__badge" title={`${issue.count} validation issue(s)`}>
                    <PriorityGlyph status={issue.error ? "critical" : "medium"} size={10} />
                    {issue.count}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {items.length === 0 ? <p className="sf-empty">No entities in this draft family.</p> : null}
      {items.length > 0 && rows.length === 0 ? <p className="sf-empty">Nothing matches “{query}”.</p> : null}
    </aside>
  );
}
