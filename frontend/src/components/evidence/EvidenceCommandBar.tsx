import { useStore } from "../../store/useStore";
import { PressHoldAck } from "../PressHoldAck";
import { Button } from "../ui/Button";
import { CommandInput } from "../ui/CommandInput";

interface EvidenceCommandBarProps {
  situationId: string;
}

export function EvidenceCommandBar({ situationId }: EvidenceCommandBarProps) {
  const goBackToMap = useStore((s) => s.goBackToMap);
  const openDagView = useStore((s) => s.openDagView);
  const openCopilotWithPrompt = useStore((s) => s.openCopilotWithPrompt);
  const setCopilotOpen = useStore((s) => s.setCopilotOpen);

  return (
    <div className="pl-evidence-command-bar" role="toolbar" aria-label="Evidence actions">
      <CommandInput
        placeholder="Ask read-only copilot about this evidence…"
        onSubmit={() => openCopilotWithPrompt("Explain this evidence")}
        className="pl-evidence-command-bar__input"
      />
      <div className="pl-evidence-command-bar__actions">
        <Button variant="primary" size="md" onClick={goBackToMap}>
          Back to Map
        </Button>
        <Button
          variant="secondary"
          size="md"
          onClick={() => openCopilotWithPrompt("Explain active situation evidence")}
        >
          Ask Read-only Copilot
        </Button>
        <Button
          variant="secondary"
          size="md"
          onClick={() => openCopilotWithPrompt("Why grouped?")}
        >
          Explain Grouping
        </Button>
        <Button
          variant="secondary"
          size="md"
          onClick={() => openDagView(situationId)}
        >
          Open DAG
        </Button>
        <Button variant="ghost" size="md" disabled title="Export scaffold — not wired">
          Export Incident
        </Button>
        <Button variant="ghost" size="md" onClick={() => setCopilotOpen(true)}>
          Explain
        </Button>
        <PressHoldAck situationId={situationId} compact />
      </div>
    </div>
  );
}