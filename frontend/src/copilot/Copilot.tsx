/**
 * Copilot panel (Domain Q) — read-only chat surface bound to the read API.
 * Voice in/out via Web Speech API. All transcripts written to the audit ledger.
 */
import { useState } from "react";

export function Copilot() {
  const [log, setLog] = useState<string[]>([]);
  const [input, setInput] = useState("");

  const send = () => {
    if (!input.trim()) return;
    setLog((l) => [...l, `you: ${input}`]);
    // Scaffold: wire to read-only tools (api/agent_tools). Narrate, never diagnose.
    setInput("");
  };

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <div className="flex-1 overflow-auto text-sm">
        {log.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded bg-white/10 px-2 py-1 text-sm"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask (read-only)…"
        />
        <button className="rounded bg-white/10 px-3 text-sm" onClick={send}>
          Send
        </button>
      </div>
    </div>
  );
}
