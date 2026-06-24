import type { CausalPathStep } from "../../types/evidence";
import { Panel } from "../ui/Panel";
import { Badge } from "../ui/Badge";

interface CausalPathPanelProps {
  steps: CausalPathStep[];
  layout?: "horizontal" | "vertical";
}

const STATUS_VARIANT = {
  confirmed: "success",
  inferred: "warning",
  missing: "unknown",
} as const;

export function CausalPathPanel({ steps, layout = "horizontal" }: CausalPathPanelProps) {
  const isVertical = layout === "vertical";

  return (
    <Panel title="Causal path" scaffold className="pl-causal-path-panel">
      <ol
        className={`pl-causal-path ${isVertical ? "pl-causal-path--vertical" : "pl-causal-path--horizontal"}`}
        aria-label="Causal path chain"
      >
        {steps.map((step, idx) => (
          <li key={step.id} className="pl-causal-path__step">
            <div className="pl-causal-path__node">
              <span className="pl-causal-path__label">{step.label}</span>
              <Badge variant={STATUS_VARIANT[step.status]}>{step.status}</Badge>
              {step.timestamp && (
                <span className="pl-causal-path__time">{step.timestamp}</span>
              )}
            </div>
            {idx < steps.length - 1 && (
              <span className="pl-causal-path__arrow" aria-hidden="true">
                {isVertical ? "↓" : "→"}
              </span>
            )}
          </li>
        ))}
      </ol>
    </Panel>
  );
}