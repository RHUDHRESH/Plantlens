import type { ReactNode } from "react";
import { useStore } from "../../store/useStore";
import { Badge } from "../ui/Badge";

interface PrimaryMapCanvasProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function PrimaryMapCanvas({ children, fallback }: PrimaryMapCanvasProps) {
  const degraded = useStore((s) => s.degraded);

  return (
    <div className="pl-map-canvas">
      {degraded && fallback ? fallback : children}
      {degraded && (
        <div className="pl-map-canvas__degraded-banner" role="status">
          <Badge variant="warning" dot>
            Degraded
          </Badge>
          <span>2D fallback active — 3D map unavailable</span>
        </div>
      )}
    </div>
  );
}