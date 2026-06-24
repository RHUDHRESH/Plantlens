import { useState } from "react";
import { useStore } from "../../store/useStore";
import { CommandInput } from "../ui/CommandInput";
import { Button } from "../ui/Button";

export function CopilotAskInput() {
  const sendCopilotMessage = useStore((s) => s.sendCopilotMessage);
  const [input, setInput] = useState("");

  const send = () => {
    const text = input.trim();
    if (!text) return;
    sendCopilotMessage(text);
    setInput("");
  };

  return (
    <div className="pl-copilot-ask" role="form" aria-label="Ask copilot">
      <CommandInput
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onSubmit={send}
        placeholder="Ask about this situation…"
        large
        readOnlyHint={false}
      />
      <Button variant="primary" size="md" onClick={send} aria-label="Send question">
        ↑
      </Button>
    </div>
  );
}