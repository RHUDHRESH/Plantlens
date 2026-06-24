import { useStore } from "../../store/useStore";
import { Button } from "../ui/Button";

export function CopilotCommandBar() {
  const {
    goBackToEvidence,
    goBackToMap,
    clearCopilotChat,
    setCopilotShowToolTrace,
    copilotShowToolTrace,
  } = useStore();

  return (
    <div className="pl-copilot-command-bar" role="toolbar" aria-label="Copilot actions">
      <p className="pl-copilot-command-bar__notice">
        Transcript export is draft/audit only. Copilot cannot write, control, or deploy.
      </p>

      <div className="pl-copilot-command-bar__actions">
        <Button variant="secondary" size="md" onClick={goBackToEvidence}>
          Back Evidence
        </Button>
        <Button variant="secondary" size="md" onClick={goBackToMap}>
          Back Map
        </Button>
        <Button
          variant="ghost"
          size="md"
          onClick={() => setCopilotShowToolTrace(!copilotShowToolTrace)}
          className="pl-copilot-command-bar__trace-toggle"
          aria-pressed={copilotShowToolTrace}
        >
          Show Tool Trace
        </Button>
        <Button variant="ghost" size="md" onClick={clearCopilotChat}>
          Clear Chat
        </Button>
        <Button
          variant="ghost"
          size="md"
          disabled
          title="Export transcript scaffold — draft/audit only, no deployment"
        >
          Export Transcript — Draft
        </Button>
        <Button variant="ghost" size="md" disabled title="Voice input scaffold — optional">
          Voice Input — Optional
        </Button>
      </div>
    </div>
  );
}