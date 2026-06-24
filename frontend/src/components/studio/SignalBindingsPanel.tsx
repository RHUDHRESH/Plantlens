import { Badge } from "../ui/Badge";
import type { AssetSignal } from "./studioTypes";

interface SignalBindingsPanelProps {
  signals: AssetSignal[];
}

const statusVariant = {
  bound: "success" as const,
  missing: "critical" as const,
  optional: "warning" as const,
  derived: "info" as const,
};

export function SignalBindingsPanel({ signals }: SignalBindingsPanelProps) {
  return (
    <section className="pl-studio-signals">
      <span className="pl-label">Signal Bindings</span>
      <p className="pl-studio-signals__hint">
        Signals compile into HMI bindings at model approval.
      </p>
      <ul className="pl-studio-signals__list">
        {signals.map((signal) => (
          <li key={signal.key} className="pl-studio-signals__item">
            <span className="pl-studio-signals__name">{signal.label}</span>
            <Badge variant={statusVariant[signal.status]}>{signal.status}</Badge>
            {signal.unit && (
              <span className="pl-studio-signals__unit">{signal.unit}</span>
            )}
            {signal.source && (
              <span className="pl-studio-signals__source">{signal.source}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}