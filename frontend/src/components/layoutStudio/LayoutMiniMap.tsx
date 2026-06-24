import type { LayoutBlockModel } from "./layoutStudioTypes";
import { BLOCK_SIZES } from "./layoutStudioTypes";

interface LayoutMiniMapProps {
  blocks: LayoutBlockModel[];
  selectedBlockId: string | null;
  onSelectBlock: (id: string) => void;
}

const CANVAS_W = 800;
const CANVAS_H = 560;
const MAP_W = 120;
const MAP_H = 84;

export function LayoutMiniMap({ blocks, selectedBlockId, onSelectBlock }: LayoutMiniMapProps) {
  const scaleX = MAP_W / CANVAS_W;
  const scaleY = MAP_H / CANVAS_H;

  return (
    <div className="pl-layout-minimap" aria-label="Layout mini-map">
      <span className="pl-layout-minimap__title">Overview</span>
      <svg
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        className="pl-layout-minimap__svg"
        role="img"
        aria-label="Block placement overview"
      >
        <rect
          x={0}
          y={0}
          width={MAP_W}
          height={MAP_H}
          className="pl-layout-minimap__frame"
        />
        {blocks.map((block) => {
          const size = BLOCK_SIZES[block.kind];
          const x = block.x * scaleX;
          const y = block.y * scaleY;
          const w = Math.max(size.w * scaleX, 4);
          const h = Math.max(size.h * scaleY, 3);
          const selected = block.id === selectedBlockId;
          return (
            <rect
              key={block.id}
              x={x}
              y={y}
              width={w}
              height={h}
              className={[
                "pl-layout-minimap__dot",
                selected ? "pl-layout-minimap__dot--selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onSelectBlock(block.id)}
              role="button"
              tabIndex={0}
              aria-label={block.instanceId}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectBlock(block.id);
                }
              }}
            />
          );
        })}
      </svg>
    </div>
  );
}