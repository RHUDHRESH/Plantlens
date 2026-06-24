import { useStore } from "../../store/useStore";
import {
  ALLOWED_TOOLS,
  BLOCKED_TOOLS,
  DEMO_CITATIONS,
} from "./demoCopilotData";

const GROUNDING_LABELS = {
  grounded: "Grounded answer only",
  partial: "Partial grounding",
  unknown: "Unknown grounding",
} as const;

export function ToolTracePanel() {
  const { copilotToolTrace, copilotGroundingStatus } = useStore();

  return (
    <aside className="pl-copilot-trace" aria-label="Tool trace">
      <header className="pl-copilot-trace__header">
        <h2 className="pl-copilot-trace__title">Tool trace</h2>
      </header>

      <section className="pl-copilot-trace__section">
        <h3 className="pl-copilot-trace__label">Allowed</h3>
        <ul className="pl-copilot-trace__tools">
          {ALLOWED_TOOLS.map((tool) => (
            <li key={tool.id}>
              <span className="pl-copilot-trace__tool-name">{tool.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="pl-copilot-trace__section">
        <h3 className="pl-copilot-trace__label">Blocked</h3>
        <ul className="pl-copilot-trace__tools pl-copilot-trace__tools--blocked">
          {BLOCKED_TOOLS.map((tool) => (
            <li key={tool.id}>
              <span className="pl-copilot-trace__tool-name">{tool.label}</span>
              <span className="pl-copilot-trace__blocked-tag">BLOCKED</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="pl-copilot-trace__section">
        <h3 className="pl-copilot-trace__label">Last tools</h3>
        <ul className="pl-copilot-trace__tools pl-copilot-trace__tools--used">
          {copilotToolTrace.map((tool) => (
            <li key={tool.id}>
              <code className="pl-copilot-trace__tool-code">{tool.name}</code>
              <span className="pl-copilot-trace__status-marker" aria-hidden="true">
                {tool.status === "used" ? "✓" : tool.status === "blocked" ? "×" : "○"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="pl-copilot-trace__section">
        <h3 className="pl-copilot-trace__label">Citations</h3>
        <ul className="pl-copilot-trace__citations">
          {DEMO_CITATIONS.map((c) => (
            <li key={c.id}>
              <code>{c.source}</code>
              <span className="pl-copilot-trace__cite-label">{c.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="pl-copilot-trace__section pl-copilot-trace__confidence">
        <h3 className="pl-copilot-trace__label">Confidence</h3>
        <p className="pl-copilot-trace__grounding">{GROUNDING_LABELS[copilotGroundingStatus]}</p>
        <p className="pl-copilot-trace__grounding-sub">Answer cites sources or stays silent.</p>
      </section>
    </aside>
  );
}