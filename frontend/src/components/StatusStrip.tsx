/**
 * StatusStrip (Domain P) — legacy compact status surface.
 * Primary status now lives in TopStatusBar; this re-exports a thin wrapper
 * for any embedded contexts that still import StatusStrip.
 */
import { useStore } from "../store/useStore";
import { Badge } from "./ui/Badge";

export function StatusStrip() {
  const { situations, connectionStatus, degraded } = useStore();
  const count = situations.length;

  return (
    <div className="pl-status-strip" role="status" aria-live="polite">
      <Badge
        variant={count > 0 ? "warning" : "success"}
        dot
      >
        {count > 0 ? `${count} situation${count > 1 ? "s" : ""}` : "All normal"}
      </Badge>
      <Badge
        variant={
          connectionStatus === "online"
            ? "success"
            : connectionStatus === "degraded"
              ? "warning"
              : "danger"
        }
      >
        {connectionStatus}
      </Badge>
      {degraded && <Badge variant="warning">Degraded</Badge>}
    </div>
  );
}