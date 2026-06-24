import type { ActionEnvelopeView } from "../../types/evidence";
import { Panel } from "../ui/Panel";
import { Badge } from "../ui/Badge";

interface ActionEnvelopePanelProps {
  envelope: ActionEnvelopeView;
}

const STATE_VARIANT = {
  available: "success",
  blocked: "critical",
  degraded: "warning",
  unsafe: "critical",
  unknown: "unknown",
} as const;

export function ActionEnvelopePanel({ envelope }: ActionEnvelopePanelProps) {
  return (
    <Panel title="Action envelope" className="pl-action-envelope">
      <Badge variant={STATE_VARIANT[envelope.state]}>
        {envelope.state.toUpperCase()}
      </Badge>
      <p className="pl-action-envelope__reason">{envelope.reason}</p>

      <div className="pl-action-envelope__section">
        <span className="pl-label">Allowed</span>
        <ul className="pl-action-envelope__list">
          {envelope.allowed.map((a) => (
            <li key={a}>+ {a}</li>
          ))}
        </ul>
      </div>

      <div className="pl-action-envelope__section">
        <span className="pl-label">Blocked</span>
        <ul className="pl-action-envelope__list pl-action-envelope__list--blocked">
          {envelope.blocked.map((b) => (
            <li key={b}>− {b}</li>
          ))}
        </ul>
      </div>

      <p className="pl-action-envelope__readonly">
        PlantLens does not control equipment. It only explains and audits.
      </p>
    </Panel>
  );
}