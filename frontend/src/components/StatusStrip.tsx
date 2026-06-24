/**
 * StatusStrip (Domain P) — always-visible plant state, never lost on zoom
 * (the Spotify mini-player analogue). Shows aggregate health + degraded banner.
 */
import { useStore } from "../store/useStore";

export function StatusStrip() {
  const { situations, degraded } = useStore();
  const count = situations.length;
  const worst = situations[0]?.confidence ?? 0;
  return (
    <header className="flex items-center justify-between border-b border-white/10 px-4 py-2">
      <div className="flex items-center gap-3">
        <span className="font-semibold tracking-tight">PlantLens</span>
        <span className="text-sm text-white/60">Plant: demo_plant</span>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <span className={count > 0 ? "text-amber-400" : "text-emerald-400"}>
          {count > 0 ? `${count} situation${count > 1 ? "s" : ""}` : "all normal"}
        </span>
        {worst > 0 && <span className="text-white/50">top conf {(worst * 100).toFixed(0)}%</span>}
        {degraded && <span className="text-amber-300">DEGRADED</span>}
      </div>
    </header>
  );
}
