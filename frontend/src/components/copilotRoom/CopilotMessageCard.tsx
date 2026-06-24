import type { CopilotMessage } from "./copilotRoomTypes";

function evidenceMarker(status: string): string {
  switch (status) {
    case "bound":
      return "+";
    case "missing":
      return "?";
    case "optional":
      return "○";
    default:
      return "·";
  }
}

interface CopilotMessageCardProps {
  message: CopilotMessage;
}

export function CopilotMessageCard({ message }: CopilotMessageCardProps) {
  const isUser = message.role === "user";

  return (
    <article
      className={[
        "pl-copilot-msg",
        isUser ? "pl-copilot-msg--user" : "pl-copilot-msg--copilot",
      ].join(" ")}
      aria-label={isUser ? "Your message" : "Copilot response"}
    >
      <header className="pl-copilot-msg__header">
        <span className="pl-copilot-msg__role">{isUser ? "You" : "Copilot"}</span>
      </header>

      <div className="pl-copilot-msg__body">
        {message.text.split("\n").map((line, i) => (
          <p key={i} className="pl-copilot-msg__line">
            {line || "\u00A0"}
          </p>
        ))}
      </div>

      {!isUser && message.evidence && message.evidence.length > 0 && (
        <div className="pl-copilot-msg__evidence">
          <h4 className="pl-copilot-msg__evidence-title">Evidence</h4>
          <ul>
            {message.evidence.map((e) => (
              <li key={e.signal} className={`pl-copilot-msg__evidence-item--${e.status}`}>
                <span className="pl-copilot-msg__evidence-marker" aria-hidden="true">
                  {evidenceMarker(e.status)}
                </span>
                <span>
                  {e.signal} = {e.value}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isUser && message.citations && message.citations.length > 0 && (
        <footer className="pl-copilot-msg__citations">
          <span className="pl-copilot-msg__citations-label">Cited:</span>
          {message.citations.map((c) => (
            <code key={c} className="pl-copilot-msg__citation">
              {c}
            </code>
          ))}
        </footer>
      )}
    </article>
  );
}