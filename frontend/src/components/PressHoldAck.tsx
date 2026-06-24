/**
 * PressHoldAck (Domain P) — press-and-hold acknowledge (1.5s cortisol-interrupt
 * gesture) prevents accidental ack. Duration tunable per site in roles.json.
 */
import { useRef, useState } from "react";

const HOLD_MS = 1500;

interface PressHoldAckProps {
  situationId: string;
  compact?: boolean;
}

export function PressHoldAck({ situationId, compact = false }: PressHoldAckProps) {
  const [progress, setProgress] = useState(0);
  const raf = useRef<number | null>(null);
  const start = useRef<number>(0);

  const begin = () => {
    start.current = performance.now();
    const tick = () => {
      const p = Math.min(1, (performance.now() - start.current) / HOLD_MS);
      setProgress(p);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else ack();
    };
    raf.current = requestAnimationFrame(tick);
  };

  const cancel = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    setProgress(0);
  };

  const ack = () => {
    // Scaffold: POST would go here; Law #1 means ack is a ledger write, not plant control.
    console.log("acknowledged", situationId);
    setProgress(0);
  };

  return (
    <button
      type="button"
      className={`pl-hold-ack ${compact ? "pl-hold-ack--compact" : ""}`}
      onPointerDown={begin}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      aria-label="Hold to acknowledge situation"
    >
      <div className="pl-hold-ack__fill" style={{ width: `${progress * 100}%` }} />
      <span className="pl-hold-ack__label">Hold Ack</span>
    </button>
  );
}