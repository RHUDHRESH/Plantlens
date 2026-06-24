import type { LayoutBlockModel, LayoutConnectionModel } from "./layoutStudioTypes";
import { BLOCK_SIZES } from "./layoutStudioTypes";

interface LayoutConnectionProps {
  connection: LayoutConnectionModel;
  source: LayoutBlockModel;
  target: LayoutBlockModel;
}

function anchorPoint(block: LayoutBlockModel, side: "out" | "in"): { x: number; y: number } {
  const size = BLOCK_SIZES[block.kind];
  const cx = block.x + size.w / 2;
  const cy = block.y + size.h / 2;

  if (side === "out") {
    if (block.y < 300 && block.x < 400) {
      return { x: block.x + size.w, y: cy };
    }
    return { x: cx, y: block.y + size.h };
  }

  if (block.y > 350) {
    return { x: cx, y: block.y };
  }
  return { x: block.x, y: cy };
}

function pathD(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  kind: LayoutConnectionModel["kind"],
): string {
  if (kind === "power" || kind === "process") {
    const midX = (sx + tx) / 2;
    return `M ${sx} ${sy} L ${midX} ${sy} L ${midX} ${ty} L ${tx} ${ty}`;
  }
  const midY = (sy + ty) / 2;
  return `M ${sx} ${sy} L ${sx} ${midY} L ${tx} ${midY} L ${tx} ${ty}`;
}

const KIND_CLASS: Record<LayoutConnectionModel["kind"], string> = {
  power: "pl-layout-conn--power",
  process: "pl-layout-conn--process",
  signal: "pl-layout-conn--signal",
  control: "pl-layout-conn--control",
  dependency: "pl-layout-conn--dependency",
};

export function LayoutConnection({ connection, source, target }: LayoutConnectionProps) {
  const from = anchorPoint(source, "out");
  const to = anchorPoint(target, "in");
  const d = pathD(from.x, from.y, to.x, to.y, connection.kind);
  const labelX = (from.x + to.x) / 2;
  const labelY = (from.y + to.y) / 2 - 6;

  return (
    <g
      className={[
        "pl-layout-conn",
        KIND_CLASS[connection.kind],
        connection.status === "error" ? "pl-layout-conn--error" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <path d={d} className="pl-layout-conn__path" />
      {connection.kind === "process" && (
        <polygon
          className="pl-layout-conn__arrow"
          points={`${to.x - 8},${to.y - 4} ${to.x},${to.y} ${to.x - 8},${to.y + 4}`}
        />
      )}
      <title>{connection.label}</title>
      <text
        x={labelX}
        y={labelY}
        className="pl-layout-conn__label"
        textAnchor="middle"
      >
        {connection.label}
      </text>
    </g>
  );
}