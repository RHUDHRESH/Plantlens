import { STATUS_VISUALS } from "./statusStyles";
import type { AssetStatus } from "./mapTypes";

const LEGEND_STATUSES: AssetStatus[] = [
  "normal",
  "warning",
  "critical",
  "sensor_bad",
  "offline",
  "unknown",
];

export function MapLegend({ reducedMotion = false }: { reducedMotion?: boolean }) {
  return (
    <div
      className={`map-legend${reducedMotion ? " map-legend--static" : ""}`}
      role="region"
      aria-label="Map status legend"
    >
      {LEGEND_STATUSES.map((status) => {
        const visual = STATUS_VISUALS[status];
        if (!visual.label && status === "normal") {
          return (
            <span key={status} className="map-legend__item">
              <span className="map-legend__swatch" style={{ borderColor: visual.border, background: visual.fill }} />
              <span>Normal</span>
            </span>
          );
        }
        if (!visual.label) return null;
        return (
          <span key={status} className="map-legend__item">
            <span
              className="map-legend__swatch"
              style={{ borderColor: visual.border, background: visual.fill }}
              aria-hidden
            />
            <span>
              {visual.icon} {visual.label}
            </span>
          </span>
        );
      })}
    </div>
  );
}