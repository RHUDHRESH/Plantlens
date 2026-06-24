import { useDroppable, useDndMonitor } from "@dnd-kit/core";
import { useRef, type MutableRefObject } from "react";
import { useStore } from "../../store/useStore";
import { LayoutBlock } from "./LayoutBlock";
import { LayoutConnection } from "./LayoutConnection";
import { LayoutToolbar } from "./LayoutToolbar";
import { LayoutMiniMap } from "./LayoutMiniMap";
import { BLOCK_SIZES } from "./layoutStudioTypes";

export function LayoutCanvas() {
  const {
    layoutBlocks,
    layoutConnections,
    selectedLayoutBlockId,
    setSelectedLayoutBlockId,
    role,
    layoutMode,
  } = useStore();

  const editable = role === "engineer";
  const canvasRef = useRef<HTMLDivElement>(null);

  const { setNodeRef, isOver } = useDroppable({
    id: "layout-canvas",
    disabled: !editable || layoutMode === "pan",
  });

  useDndMonitor({
    onDragEnd(event) {
      const { active, over, delta } = event;
      if (!over || over.id !== "layout-canvas") return;
      const data = active.data.current;
      if (data?.type !== "palette") return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const pointer = event.activatorEvent as PointerEvent | MouseEvent | TouchEvent;
      let clientX = 0;
      let clientY = 0;
      if ("clientX" in pointer) {
        clientX = pointer.clientX;
        clientY = pointer.clientY;
      } else if ("touches" in pointer && pointer.touches[0]) {
        clientX = pointer.touches[0].clientX;
        clientY = pointer.touches[0].clientY;
      }

      const x = clientX + delta.x - rect.left + canvas.scrollLeft - 60;
      const y = clientY + delta.y - rect.top + canvas.scrollTop - 24;

      const itemId = (data.item as { id: string }).id;
      useStore.getState().addBlockFromPalette(itemId, x, y);
    },
  });

  const blockMap = new Map(layoutBlocks.map((b) => [b.id, b]));

  return (
    <div className="pl-layout-canvas-wrap">
      <header className="pl-layout-canvas__header">
        <h2 className="pl-layout-canvas__title">Plant Layout Canvas — Line A</h2>
        <LayoutToolbar />
      </header>

      <div
        ref={(node) => {
          setNodeRef(node);
          (canvasRef as MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        className={[
          "pl-layout-canvas",
          isOver ? "pl-layout-canvas--over" : "",
          layoutMode === "pan" ? "pl-layout-canvas--pan" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => setSelectedLayoutBlockId(null)}
        role="application"
        aria-label="Plant layout canvas"
      >
        <div className="pl-layout-canvas__grid" aria-hidden="true" />

        <svg className="pl-layout-canvas__connections" aria-hidden="true">
          {layoutConnections.map((conn) => {
            const source = blockMap.get(conn.sourceId);
            const target = blockMap.get(conn.targetId);
            if (!source || !target) return null;
            return (
              <LayoutConnection
                key={conn.id}
                connection={conn}
                source={source}
                target={target}
              />
            );
          })}
        </svg>

        <div className="pl-layout-canvas__blocks">
          {layoutBlocks.map((block) => (
            <div
              key={block.id}
              className="pl-layout-canvas__block-slot"
              style={{
                left: block.x,
                top: block.y,
                width: BLOCK_SIZES[block.kind].w,
                height: BLOCK_SIZES[block.kind].h,
              }}
            >
              <LayoutBlock
                block={block}
                selected={selectedLayoutBlockId === block.id}
                editable={editable}
                onSelect={setSelectedLayoutBlockId}
              />
            </div>
          ))}
        </div>

        {editable && (
          <p className="pl-layout-canvas__hint">
            Drag blocks from palette or use + Add. Drag repositioning scaffold pending.
          </p>
        )}
      </div>

      <LayoutMiniMap
        blocks={layoutBlocks}
        selectedBlockId={selectedLayoutBlockId}
        onSelectBlock={setSelectedLayoutBlockId}
      />
    </div>
  );
}