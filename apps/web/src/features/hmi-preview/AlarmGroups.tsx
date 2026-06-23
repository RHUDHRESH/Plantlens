import type { AlarmGroup } from "../../app/schemas/plantHmi";

interface AlarmGroupsProps {
  groups: AlarmGroup[];
}

export function AlarmGroups({ groups }: AlarmGroupsProps) {
  if (groups.length === 0) {
    return (
      <section className="hmi-alarm-groups hmi-alarm-groups--empty" aria-label="Alarm groups">
        <h2>Alarm groups</h2>
        <p>No alarm groups supplied.</p>
      </section>
    );
  }

  return (
    <section className="hmi-alarm-groups" aria-label="Alarm groups">
      <h2>Alarm groups</h2>
      <ul className="hmi-alarm-groups__list">
        {groups.map((group) => (
          <li key={group.group_id} className="hmi-alarm-groups__item">
            <h3>{group.title}</h3>
            <p>
              Severity: {group.severity}
              {group.root_alarm ? ` · Root: ${group.root_alarm}` : ""}
            </p>
            <p>Grouped: {group.grouped_alarms.join(", ") || "—"}</p>
            {group.suppressed_duplicates.length > 0 && (
              <p>
                {group.suppressed_duplicates.length} alarms grouped —{" "}
                <button type="button" className="pl-btn pl-btn--ghost pl-btn--compact">
                  view receipts
                </button>
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}