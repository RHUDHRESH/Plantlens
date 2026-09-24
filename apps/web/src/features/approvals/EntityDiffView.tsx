import { ChevronRight } from "lucide-react";
import type { EntityDiff } from "../../api/v2";
import { EmptyState } from "../../components/ui/primitives";
import { describeEntity, formatValue, groupDiff } from "./diffFormat";
import type { DiffKind } from "./diffFormat";

const KIND_TEXT: Record<DiffKind, { sign: string; label: string }> = {
  added: { sign: "+", label: "Added" },
  changed: { sign: "~", label: "Changed" },
  removed: { sign: "−", label: "Removed" },
};

export function KindMark({ kind }: { kind: DiffKind }) {
  const t = KIND_TEXT[kind];
  return (
    <span className={`eng-kind eng-kind--${kind}`}>
      <span aria-hidden>{t.sign}</span>
      {t.label}
    </span>
  );
}

export function KindCounts({ counts }: { counts: Record<DiffKind, number> }) {
  return (
    <span className="eng-counts" aria-label={`${counts.added} added, ${counts.changed} changed, ${counts.removed} removed`}>
      {(["added", "changed", "removed"] as DiffKind[]).map((k) =>
        counts[k] ? (
          <span key={k} className={`eng-counts__item eng-counts__item--${k}`}>
            {KIND_TEXT[k].sign}
            {counts[k]}
          </span>
        ) : null,
      )}
    </span>
  );
}

function FieldValue({ value }: { value: unknown }) {
  if (value !== null && typeof value === "object") {
    const text = JSON.stringify(value, null, 2);
    if (text.length > 90) {
      return <pre className="eng-json eng-json--inline">{text}</pre>;
    }
    return <code className="pl-mono">{JSON.stringify(value)}</code>;
  }
  return <code className="pl-mono">{formatValue(value)}</code>;
}

function EntityBody({ entry }: { entry: EntityDiff }) {
  if (entry.kind === "changed" && entry.fields) {
    return (
      <table className="eng-fields">
        <colgroup>
          <col className="eng-fields__c-field" />
          <col />
          <col className="eng-fields__c-arrow" />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">Before</th>
            <th scope="col" aria-hidden />
            <th scope="col">After</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(entry.fields).map(([field, v]) => (
            <tr key={field}>
              <th scope="row" className="pl-mono">{field}</th>
              <td className="eng-fields__before"><FieldValue value={v.before} /></td>
              <td aria-hidden className="eng-fields__arrow">→</td>
              <td className="eng-fields__after"><FieldValue value={v.after} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  const value = entry.after ?? entry.before ?? {};
  return (
    <dl className="eng-props">
      {Object.entries(value).map(([k, v]) => (
        <div key={k} className="eng-props__row">
          <dt className="pl-mono">{k}</dt>
          <dd><FieldValue value={v} /></dd>
        </div>
      ))}
    </dl>
  );
}

export function EntityDiffView({
  diff,
  unitFor,
  lookup,
  emptyText = "No entity changes.",
}: {
  diff: readonly EntityDiff[];
  unitFor?: ((tag: string) => string | null | undefined) | undefined;
  lookup?: ((entry: EntityDiff) => Record<string, unknown> | undefined) | undefined;
  emptyText?: string;
}) {
  const groups = groupDiff(diff);
  if (!groups.length) return <EmptyState title={emptyText} />;
  return (
    <div className="eng-diff">
      {groups.map((group) => (
        <section key={group.key} className="eng-diff__group" aria-label={group.label}>
          <header className="eng-diff__group-head">
            <h3>{group.label}</h3>
            <span className="eng-diff__doc pl-mono">{group.doc}.{group.collection}</span>
            <KindCounts counts={group.counts} />
          </header>
          <ul className="eng-diff__list">
            {group.items.map((entry) => (
              <li key={`${entry.kind}:${entry.id}`} className={`eng-diff__item eng-diff__item--${entry.kind}`}>
                <details open={entry.kind === "changed"}>
                  <summary>
                    <ChevronRight className="eng-diff__chev" aria-hidden />
                    <KindMark kind={entry.kind} />
                    <span className="eng-diff__headline">{describeEntity(entry, unitFor, lookup)}</span>
                    <span className="eng-diff__id pl-mono">{entry.id}</span>
                  </summary>
                  <div className="eng-diff__body">
                    <EntityBody entry={entry} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
