import { Badge } from "../ui/Badge";
import type { FaultMode } from "./studioTypes";

interface FaultModePanelProps {
  faultModes: FaultMode[];
}

const severityVariant = {
  warning: "warning" as const,
  critical: "critical" as const,
  info: "info" as const,
};

export function FaultModePanel({ faultModes }: FaultModePanelProps) {
  return (
    <section className="pl-studio-faults">
      <span className="pl-label">Fault Modes</span>
      <p className="pl-studio-faults__hint">
        These symptoms feed known-fault scoring.
      </p>
      <ul className="pl-studio-faults__list">
        {faultModes.map((fault) => (
          <li key={fault.id} className="pl-studio-faults__item">
            <div className="pl-studio-faults__header">
              <span className="pl-studio-faults__label">{fault.label}</span>
              <Badge variant={severityVariant[fault.severity]}>{fault.severity}</Badge>
            </div>
            <p className="pl-studio-faults__symptoms">
              expects {fault.expectedSymptoms.join(" + ")}
            </p>
            {fault.contradictions && fault.contradictions.length > 0 && (
              <p className="pl-studio-faults__contra">
                contradicts {fault.contradictions.join("; ")}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}