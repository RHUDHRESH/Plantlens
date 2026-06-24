/**
 * 2D degraded fallback (Domain U) — working code, not a promise. Shown when the
 * 3D engine fails or the cognition layer is offline. Must be OBVIOUSLY different
 * visually so operators know they lost the cognition layer.
 */
import { useStore } from "../store/useStore";

export function Plant2D() {
  const { values, situations, degraded } = useStore();
  return (
    <div className="h-full overflow-auto p-4">
      {degraded && (
        <div className="mb-4 rounded bg-amber-600/20 p-3 text-amber-300 ring-1 ring-amber-600">
          DEGRADED MODE — cognition layer offline; showing raw ISA-18.2 alarm list
        </div>
      )}
      <h2 className="mb-2 text-sm uppercase tracking-wide text-white/60">Raw signals</h2>
      <ul className="mb-4 space-y-1 font-mono text-sm">
        {values.map((v, i) => (
          <li key={i}>
            {v.instance_id}.{v.signal_key} = {String(v.value)} {v.unit ?? ""} [{v.quality}]
          </li>
        ))}
      </ul>
      <h2 className="mb-2 text-sm uppercase tracking-wide text-white/60">Situations</h2>
      <ul className="space-y-1 font-mono text-sm">
        {situations.map((s) => (
          <li key={s.id}>
            {s.primary_fault} conf={s.confidence.toFixed(2)} cov={s.coverage.toFixed(2)}
          </li>
        ))}
      </ul>
    </div>
  );
}
