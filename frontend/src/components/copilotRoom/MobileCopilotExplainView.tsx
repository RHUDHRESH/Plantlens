import { useStore } from "../../store/useStore";
import { getSituationMeta, DEMO_PLANT_NAME } from "../../data/demoPlant";
import { COPILOT_LIMITS } from "./demoCopilotData";
import { CopilotMessageCard } from "./CopilotMessageCard";
import { CopilotAskInput } from "./CopilotAskInput";
import { ToolTracePanel } from "./ToolTracePanel";
import { Panel } from "../ui/Panel";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";

const SOURCE_LABELS = { sim: "SIM", modbus: "MODBUS", opcua: "OPC UA" } as const;

export function MobileCopilotExplainView() {
  const {
    situations,
    selectedSituationId,
    role,
    sourceMode,
    connectionStatus,
    copilotMessages,
    copilotOriginScreen,
    goBackToEvidence,
    goBackToMap,
    clearCopilotChat,
    copilotShowToolTrace,
    setCopilotShowToolTrace,
  } = useStore();

  const situation =
    situations.find((s) => s.id === selectedSituationId) ?? situations[0] ?? null;
  const meta = situation ? getSituationMeta(situation.id) : undefined;

  return (
    <div className="pl-mobile-copilot">
      <header className="pl-mobile-copilot__header">
        <span className="pl-label">Copilot</span>
        <h1 className="pl-mobile-copilot__title">Read-only</h1>
        <div className="pl-mobile-copilot__badges">
          <Badge variant="readonly">READ-ONLY</Badge>
          <Badge variant="readonly">NO CONTROL</Badge>
        </div>
      </header>

      <Panel title="Context" variant="light">
        <p className="pl-mobile-copilot__meta">
          {situation?.primary_fault ?? "No situation"}
        </p>
        <p className="pl-mobile-copilot__meta">
          {meta?.assetId ?? "—"} / {copilotOriginScreen === "evidence" ? "Evidence Room" : "Map"}
        </p>
        <p className="pl-mobile-copilot__meta">
          {SOURCE_LABELS[sourceMode]} ● {connectionStatus.toUpperCase()}
        </p>
        <p className="pl-mobile-copilot__meta">{DEMO_PLANT_NAME} · {role}</p>
      </Panel>

      <Panel title="Copilot limits" variant="light">
        <ul className="pl-mobile-copilot__limits">
          <li><span aria-hidden="true">✓</span> can read model/state</li>
          <li><span aria-hidden="true">✓</span> can explain evidence</li>
          {COPILOT_LIMITS.filter((l) => !l.allowed).map((l) => (
            <li key={l.id}>
              <span aria-hidden="true">×</span> cannot {l.text.toLowerCase()}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Chat" variant="light">
        <div className="pl-mobile-copilot__chat">
          {copilotMessages.map((msg) => (
            <CopilotMessageCard key={msg.id} message={msg} />
          ))}
        </div>
      </Panel>

      {copilotShowToolTrace && (
        <Panel title="Tool trace" variant="light" padding="sm">
          <ToolTracePanel />
        </Panel>
      )}

      <div className="pl-mobile-copilot__ask">
        <CopilotAskInput />
      </div>

      <div className="pl-mobile-copilot__actions">
        <Button variant="secondary" size="lg" fullWidth onClick={goBackToEvidence}>
          Back Evidence
        </Button>
        <Button variant="secondary" size="lg" fullWidth onClick={goBackToMap}>
          Back Map
        </Button>
        <Button
          variant="ghost"
          size="lg"
          fullWidth
          onClick={() => setCopilotShowToolTrace(!copilotShowToolTrace)}
        >
          {copilotShowToolTrace ? "Hide Tool Trace" : "Show Tool Trace"}
        </Button>
        <Button variant="ghost" size="lg" fullWidth onClick={clearCopilotChat}>
          Clear Chat
        </Button>
      </div>
    </div>
  );
}