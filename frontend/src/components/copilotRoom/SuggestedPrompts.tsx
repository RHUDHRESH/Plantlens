import { useStore } from "../../store/useStore";
import { SUGGESTED_PROMPTS } from "./demoCopilotData";

export function SuggestedPrompts() {
  const sendCopilotMessage = useStore((s) => s.sendCopilotMessage);

  return (
    <div className="pl-copilot-suggested" aria-label="Suggested prompts">
      <h3 className="pl-copilot-suggested__title">Suggested prompts</h3>
      <div className="pl-copilot-suggested__chips">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="pl-copilot-suggested__chip"
            onClick={() => sendCopilotMessage(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}