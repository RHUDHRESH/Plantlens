import type { UserRole } from "../operational-map";
import { isEditableSourceRef, buildStudioOpenIntent } from "./sourceLineageModel";
import type { AssetSourceLineage, SourceLineageRef, StudioOpenIntent } from "./sourceLineageTypes";

interface SourceLineagePanelProps {
  lineage: AssetSourceLineage | null;
  role: UserRole;
  onOpenStudio: (intent: StudioOpenIntent) => void;
}

function groupRefs(refs: SourceLineageRef[]) {
  return {
    authored: refs.filter((r) => r.authored),
    compiled: refs.filter((r) => r.family === "hmi_view_model"),
    runtime: refs.filter((r) => r.family === "runtime"),
  };
}

function RefRow({
  refItem,
  onOpenStudio,
}: {
  refItem: SourceLineageRef;
  onOpenStudio: (intent: StudioOpenIntent) => void;
}) {
  const editable = isEditableSourceRef(refItem);
  const intent = buildStudioOpenIntent(refItem);

  return (
    <li className="source-lineage__ref">
      <div className="source-lineage__ref-main">
        <span className="source-lineage__ref-label">{refItem.label}</span>
        <span className="source-lineage__ref-path data-number">{refItem.path}</span>
        <span className="source-lineage__ref-reason">{refItem.reason}</span>
      </div>
      {editable ? (
        <button
          type="button"
          className="pl-btn pl-btn--compact"
          onClick={() => onOpenStudio(intent)}
        >
          Open in Studio
        </button>
      ) : (
        <button
          type="button"
          className="pl-btn pl-btn--ghost pl-btn--compact"
          disabled
          title={refItem.reason}
        >
          Inspect
        </button>
      )}
    </li>
  );
}

function RefGroup({
  title,
  refs,
  onOpenStudio,
  note,
}: {
  title: string;
  refs: SourceLineageRef[];
  onOpenStudio: (intent: StudioOpenIntent) => void;
  note?: string;
}) {
  if (!refs.length) return null;
  return (
    <section className="source-lineage__group">
      <h4>{title}</h4>
      {note && <p className="source-lineage__group-note">{note}</p>}
      <ul>
        {refs.map((refItem) => (
          <RefRow key={`${refItem.family}:${refItem.kind}:${refItem.path}`} refItem={refItem} onOpenStudio={onOpenStudio} />
        ))}
      </ul>
    </section>
  );
}

export function SourceLineagePanel({ lineage, role, onOpenStudio }: SourceLineagePanelProps) {
  if (!lineage) return null;

  if (role === "operator") {
    return (
      <section className="source-lineage source-lineage--operator" aria-label="Source model">
        <p className="source-lineage__role-note">Source model available to engineering roles.</p>
      </section>
    );
  }

  if (role === "manager") {
    return (
      <section className="source-lineage source-lineage--manager" aria-label="Source model summary">
        <h3>Source model summary</h3>
        <div className="source-lineage__summary-grid">
          <div>
            <span className="source-lineage__summary-label">Tags</span>
            <span className="data-number">{lineage.tagIds.length}</span>
          </div>
          <div>
            <span className="source-lineage__summary-label">Alarms</span>
            <span className="data-number">{lineage.alarmIds.length}</span>
          </div>
          <div>
            <span className="source-lineage__summary-label">Causal edges</span>
            <span className="data-number">{lineage.causalEdgeIds.length}</span>
          </div>
          <div>
            <span className="source-lineage__summary-label">Actions</span>
            <span className="data-number">{lineage.actionIds.length}</span>
          </div>
        </div>
      </section>
    );
  }

  const groups = groupRefs(lineage.refs);

  return (
    <section className="source-lineage" aria-label="Source lineage">
      <h3>Source lineage</h3>
      <p className="source-lineage__group-note">
        Compiled HMI is output — edit authored contracts instead.
      </p>

      <RefGroup title="Authored source" refs={groups.authored} onOpenStudio={onOpenStudio} />
      <RefGroup
        title="Compiled HMI output"
        refs={groups.compiled}
        onOpenStudio={onOpenStudio}
        note="Compiled output — not editable here."
      />
      <RefGroup
        title="Runtime evidence"
        refs={groups.runtime}
        onOpenStudio={onOpenStudio}
        note="Live runtime projection — not editable here."
      />

      {lineage.warnings.length > 0 && (
        <section className="source-lineage__group">
          <h4>Warnings</h4>
          <ul className="source-lineage__warnings">
            {lineage.warnings.map((warning) => (
              <li key={warning} className="source-lineage__warning">
                {warning}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}