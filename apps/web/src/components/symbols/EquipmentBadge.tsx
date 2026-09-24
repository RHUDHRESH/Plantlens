/**
 * Corner badge for abnormal equipment status: the shape-coded PriorityGlyph (▲ ◆ ■ ● …) on a
 * neutral disc, so status never relies on colour alone. Renders nothing for "normal".
 *
 *  - mode="html" (default): an absolutely positioned <span>; wrap the symbol in an element with
 *    `className="pl-sym-badge-host"` (position: relative) or your own positioned container.
 *  - mode="svg": a <g> centred on (x, y) in the parent SVG's user units, for 2D map nodes and for
 *    `<EquipmentSymbol badge />`.
 */
import { PriorityGlyph, type StatusKind } from "../ui/primitives";

const BADGE_LABEL: Record<StatusKind, string> = {
  normal: "Normal",
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  sensor_bad: "Sensor bad",
  offline: "Offline",
  shelved: "Shelved",
  acked: "Acknowledged",
};

export function isAbnormalStatus(status: StatusKind | null | undefined): status is Exclude<StatusKind, "normal"> {
  return !!status && status !== "normal";
}

export interface EquipmentBadgeProps {
  status: StatusKind | null | undefined;
  mode?: "html" | "svg";
  /** svg mode: badge centre in the parent's user units (default 44, 4 = top-right of a 48 grid). */
  x?: number;
  y?: number;
  /** Glyph size: px in html mode (default 11), user units in svg mode (default 12). */
  size?: number;
  /** Accessible name; defaults to the status label ("Critical"). Pass "" to hide from AT. */
  title?: string;
  className?: string;
}

export function EquipmentBadge({ status, mode = "html", x = 44, y = 4, size, title, className }: EquipmentBadgeProps) {
  if (!isAbnormalStatus(status)) return null;
  const label = title ?? BADGE_LABEL[status];
  if (mode === "svg") {
    const s = size ?? 12;
    const r = s / 2 + s * 0.3;
    return (
      <g
        className={["pl-sym-badge-svg", `pl-sym-badge--${status}`, className].filter(Boolean).join(" ")}
        transform={`translate(${x} ${y})`}
        data-status={status}
      >
        <circle r={r} className="pl-sym-badge-bg" />
        <g transform={`translate(${-s / 2} ${-s / 2})`}>
          <PriorityGlyph status={status} size={s} {...(label ? { title: label } : {})} />
        </g>
      </g>
    );
  }
  return (
    <span className={["pl-sym-badge", `pl-sym-badge--${status}`, className].filter(Boolean).join(" ")} data-status={status}>
      <PriorityGlyph status={status} size={size ?? 11} {...(label ? { title: label } : {})} />
    </span>
  );
}
