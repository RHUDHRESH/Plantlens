import { useStore } from "../../store/useStore";
import { CopilotMessageCard } from "./CopilotMessageCard";
import { CopilotAskInput } from "./CopilotAskInput";
import { SuggestedPrompts } from "./SuggestedPrompts";
import { EmptyState } from "../ui/EmptyState";

export function CopilotChatPanel() {
  const copilotMessages = useStore((s) => s.copilotMessages);

  return (
    <div className="pl-copilot-chat">
      <header className="pl-copilot-chat__header">
        <h2 className="pl-copilot-chat__title">Read-only Copilot</h2>
        <p className="pl-copilot-chat__subtitle">
          Industrial evidence assistant — bounded, cited, no plant control.
        </p>
      </header>

      <div className="pl-copilot-chat__transcript" aria-label="Chat transcript" role="log">
        {copilotMessages.length === 0 ? (
          <EmptyState
            title="Ask about this situation"
            description="Copilot reads model, state, evidence, and audit only. No write path."
            scaffold
          />
        ) : (
          copilotMessages.map((msg) => <CopilotMessageCard key={msg.id} message={msg} />)
        )}
      </div>

      <SuggestedPrompts />
      <CopilotAskInput />
    </div>
  );
}