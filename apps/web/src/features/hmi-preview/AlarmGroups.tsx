import type { AlarmGroup } from "../../app/schemas/plantHmi";
import { Panel, StatusBadge } from "../../components/ui/primitives";
import { severityKind, statusLabel } from "./statusStyles";

interface AlarmGroupsProps {
  groups: AlarmGroup[];
}

export function AlarmGroups({ groups }: AlarmGroupsProps) {
  return (
    <Panel title="Alarm groups" aria-label="Alarm groups" className="hmi-card">
      {groups.length === 0 ? (
        <p className="hmi-muted">No alarm groups supplied.</p>
      ) : (
        <ul className="hmi-list">
          {groups.map((group) => (
            <li key={group.group_id} className="hmi-item">
              <div className="hmi-item__head">
                <h3 className="hmi-item__title">{group.title}</h3>
                <StatusBadge compact status={severityKind(group.severity)} label={statusLabel(group.severity)} />
              </div>
              {group.root_alarm ? (
                <p className="hmi-meta">
                  Root <span className="pl-mono">{group.root_alarm}</span>
                </p>
              ) : null}
              <p className="hmi-meta">
                Grouped: <span className="pl-mono">{group.grouped_alarms.join(", ") || "—"}</span>
              </p>
              {group.suppressed_duplicates.length > 0 && (
                <p className="hmi-meta">
                  {group.suppressed_duplicates.length} alarms grouped —{" "}
                  <button type="button" className="pl-btn pl-btn--ghost pl-btn--sm">
                    view receipts
                  </button>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
