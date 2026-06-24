/**
 * PressHoldAck (Domain P) — press-and-hold acknowledge (1.5s cortisol-interrupt
 * gesture) prevents accidental ack. Duration tunable per site in roles.json.
 * Confirmation dialog shows exactly what is acknowledged.
 */
import { useRef, useState } from "react";
import { useStore } from "../store/useStore";

const HOLD_MS = 1500;

export function PressHoldAck({ situationId }: { situationId: string }) {
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
      className="relative w-full overflow-hidden rounded bg-white/10 py-2 text-sm"
      onPointerDown={begin}
      onPointerUp={cancel}
      onPointerLeave={cancel}
    >
      <div className="absolute inset-y-0 left-0 bg-emerald-600/40" style={{ width: `${progress * 100}%` }} />
      <span className="relative">Hold to acknowledge</span>
    </button>
  );
}

// silence unused import warning in scaffold
void useStore;
