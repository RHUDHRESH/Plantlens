import { useStore } from "../../store/useStore";
import { getSituationMeta, DEMO_PLANT_NAME } from "../../data/demoPlant";
import { COPILOT_LIMITS, QUICK_QUESTIONS, getActiveScreenLabel } from "./demoCopilotData";

const ROLE_LABELS = {
  operator: "Operator",
  maintenance: "Maintenance",
  supervisor: "Supervisor",
  engineer: "Engineer",
} as const;

const SOURCE_LABELS = {
  sim: "SIM",
  modbus: "MODBUS",
  opcua: "OPC UA",
} as const;

export function CopilotContextPanel() {
  const {
    screen,
    situations,
    selectedSituationId,
    role,
    sourceMode,
    connectionStatus,
    sendCopilotMessage,
    copilotOriginScreen,
  } = useStore();

  const situation =
    situations.find((s) => s.id === selectedSituationId) ?? situations[0] ?? null;
  const meta = situation ? getSituationMeta(situation.id) : undefined;
  const originLabel = getActiveScreenLabel(copilotOriginScreen ?? screen);

  return (
    <aside className="pl-copilot-context" aria-label="Copilot context">
      <header className="pl-copilot-context__header">
        <h2 className="pl-copilot-context__title">Context</h2>
      </header>

      <section className="pl-copilot-context__section">
        <h3 className="pl-copilot-context__label">Active screen</h3>
        <p className="pl-copilot-context__value">{originLabel}</p>
        <p className="pl-copilot-context__sub">{DEMO_PLANT_NAME}</p>
      </section>

      {situation && (
        <section className="pl-copilot-context__section">
          <h3 className="pl-copilot-context__label">Situation</h3>
          <p className="pl-copilot-context__value">{situation.primary_fault}</p>
          <p className="pl-copilot-context__sub">{meta?.assetId ?? "—"}</p>
        </section>
      )}

      <section className="pl-copilot-context__section">
        <h3 className="pl-copilot-context__label">Role</h3>
        <p className="pl-copilot-context__value">{ROLE_LABELS[role]}</p>
      </section>

      <section className="pl-copilot-context__section">
        <h3 className="pl-copilot-context__label">Source</h3>
        <p className="pl-copilot-context__value">
          {SOURCE_LABELS[sourceMode]} / {connectionStatus.toUpperCase()}
        </p>
      </section>

      <section className="pl-copilot-context__section">
        <h3 className="pl-copilot-context__label">Copilot limits</h3>
        <ul className="pl-copilot-context__limits">
          {COPILOT_LIMITS.map((limit) => (
            <li key={limit.id}>
              <span aria-hidden="true">{limit.allowed ? "✓" : "×"}</span>
              {limit.text}
            </li>
          ))}
        </ul>
      </section>

      <section className="pl-copilot-context__section">
        <h3 className="pl-copilot-context__label">Quick questions</h3>
        <ul className="pl-copilot-context__quick">
          {QUICK_QUESTIONS.map((q) => (
            <li key={q}>
              <button
                type="button"
                className="pl-copilot-context__quick-btn"
                onClick={() => sendCopilotMessage(q)}
              >
                {q}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}