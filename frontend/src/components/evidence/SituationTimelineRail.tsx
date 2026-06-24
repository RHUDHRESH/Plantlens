import { useState } from "react";
import { useStore } from "../../store/useStore";
import type { EvidenceRoomData } from "../../types/evidence";
import type { Situation } from "../../store/useStore";
import { Panel } from "../ui/Panel";
import { IconButton } from "../ui/IconButton";
import { Badge } from "../ui/Badge";
import { getSituationMeta } from "../../data/demoPlant";

interface SituationTimelineRailProps {
  situations: Situation[];
  selectedId: string | null;
  evidence: EvidenceRoomData;
  onSelectSituation: (id: string) => void;
}

export function SituationTimelineRail({
  situations,
  selectedId,
  evidence,
  onSelectSituation,
}: SituationTimelineRailProps) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const toggleLeftRail = useStore((s) => s.toggleLeftRail);

  return (
    <div className="pl-evidence-rail">
      <header className="pl-evidence-rail__header">
        <h2 className="pl-evidence-rail__title">Situations</h2>
        <IconButton label="Close situations rail" onClick={toggleLeftRail}>
          <CloseIcon />
        </IconButton>
      </header>

      <Panel title="Active" subtitle={`${situations.length} total`}>
        <ul className="pl-evidence-rail__situations" role="list">
          {situations.map((s) => {
            const meta = getSituationMeta(s.id);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className={`pl-evidence-rail__situation ${
                    selectedId === s.id ? "pl-evidence-rail__situation--active" : ""
                  }`}
                  onClick={() => onSelectSituation(s.id)}
                >
                  <span className="pl-evidence-rail__situation-title">{s.primary_fault}</span>
                  <Badge variant={meta?.severity === "unknown" ? "unknown" : "warning"}>
                    {meta?.severity ?? "warning"}
                  </Badge>
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Collapse" scaffold>
        <p className="pl-evidence-rail__collapse">{evidence.collapseSummary}</p>
        <span className="pl-scaffold-tag">Demo fallback</span>
      </Panel>

      <Panel title="Timeline">
        <ul className="pl-evidence-rail__timeline" role="list">
          {evidence.timeline.map((ev) => (
            <li key={ev.id}>
              <button
                type="button"
                className={`pl-evidence-rail__event ${
                  selectedEventId === ev.id ? "pl-evidence-rail__event--active" : ""
                }`}
                onClick={() => setSelectedEventId(ev.id)}
              >
                <span className="pl-evidence-rail__event-time">{ev.time}</span>
                <span className="pl-evidence-rail__event-label">{ev.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M5.5 4.5L10 9l4.5-4.5L15 5.5 10.5 10 15 14.5l-1.5 1.5L10 11.5 5.5 16 4 14.5 8.5 10 4 5.5z" />
    </svg>
  );
}