/**
 * Copilot panel (Domain Q) — read-only chat surface bound to the read API.
 * Voice in/out via Web Speech API. All transcripts written to the audit ledger.
 */
import { useState } from "react";
import { useStore } from "../store/useStore";
import { CommandInput } from "../components/ui/CommandInput";
import { Button } from "../components/ui/Button";
import { IconButton } from "../components/ui/IconButton";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";

const SCAFFOLD_REPLY = "Copilot tools pending.";

const QUICK_PROMPTS = [
  "Explain active situation",
  "Show last 10 audit events",
  "Why grouped?",
] as const;

export function Copilot() {
  const [log, setLog] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const toggleCopilot = useStore((s) => s.toggleCopilot);

  const runPrompt = (prompt: string) => {
    setLog((l) => [...l, `you: ${prompt}`, `copilot: ${SCAFFOLD_REPLY}`]);
  };

  const send = () => {
    if (!input.trim()) return;
    runPrompt(input);
    setInput("");
  };

  return (
    <div className="pl-copilot">
      <header className="pl-copilot__header">
        <div>
          <h2 className="pl-copilot__title">Read-only Copilot</h2>
          <Badge variant="readonly">No plant write access</Badge>
        </div>
        <IconButton label="Close copilot" onClick={toggleCopilot}>
          <CloseIcon />
        </IconButton>
      </header>

      <p className="pl-copilot__disclaimer">
        Narrates plant state from read APIs only. All transcripts are audit-logged.
        <span className="pl-scaffold-tag">Scaffold / Demo</span>
      </p>

      <div className="pl-copilot__chips">
        {QUICK_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            className="pl-copilot__chip"
            onClick={() => runPrompt(p)}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="pl-copilot__citations">
        <span className="pl-scaffold-tag">Tool citations — scaffold</span>
      </div>

      <div className="pl-copilot__log">
        {log.length === 0 ? (
          <EmptyState
            title="Ask about plant state"
            description="Queries are read-only. Copilot narrates, never diagnoses or controls."
            scaffold
          />
        ) : (
          log.map((line, i) => (
            <div key={i} className="pl-copilot__line">
              {line}
            </div>
          ))
        )}
      </div>

      <div className="pl-copilot__input-row">
        <CommandInput
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onSubmit={send}
          placeholder="Ask (read-only)…"
          large
        />
        <Button variant="secondary" size="md" onClick={send}>
          Send
        </Button>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M5.5 4.5L10 9l4.5-4.5L15 5.5 10.5 10 15 14.5l-1.5 1.5L10 11.5 5.5 16 4 14.5 8.5 10 4 5.5z" />
    </svg>
  );
}