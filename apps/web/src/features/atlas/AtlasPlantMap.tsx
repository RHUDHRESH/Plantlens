import { Minus, Plus } from "lucide-react";
import { useAtlasStore } from "../../app/store/atlas";
import type { Situation } from "../../app/schemas/situation";
import type { TagFrame } from "../../app/schemas/tagFrame";
import { cn } from "../../lib/cn";
import { AtlasSVGMap } from "./AtlasSVGMap";
import { getPlantLayoutPositions } from "./plantLayout";
import { buildCausalPath } from "./treeHelpers";

interface AtlasPlantMapProps {
  tags: Record<string, TagFrame>;
  activeSituation: Situation | null;
  reducedMotion?: boolean;
  onSelectEquipment: (id: string) => void;
}

export function AtlasPlantMap({
  tags,
  activeSituation,
  reducedMotion = false,
  onSelectEquipment,
}: AtlasPlantMapProps) {
  const mapOrientation = useAtlasStore((s) => s.mapOrientation);
  const setMapOrientation = useAtlasStore((s) => s.setMapOrientation);
  const selectedEquipmentId = useAtlasStore((s) => s.selectedEquipmentId);
  const mapScale = useAtlasStore((s) => s.mapScale);
  const zoomIn = useAtlasStore((s) => s.zoomIn);
  const zoomOut = useAtlasStore((s) => s.zoomOut);

  const layout = getPlantLayoutPositions();
  const positions =
    mapOrientation === "vertical" ? layout.vertical : layout.horizontal;
  const causalPath = buildCausalPath(activeSituation);

  return (
    <div className="w-full h-full relative overflow-hidden bg-canvas flex items-center justify-center">
      <div
        className="w-full h-full transition-transform duration-200 ease-out"
        style={{ transform: `scale(${mapScale})`, transformOrigin: "center center" }}
      >
        <AtlasSVGMap
          positions={positions}
          selectedEquipmentId={selectedEquipmentId}
          activeSituation={activeSituation}
          causalPath={causalPath}
          tags={tags}
          reducedMotion={reducedMotion}
          onSelectEquipment={onSelectEquipment}
        />
      </div>

      <div className="absolute bottom-4 right-4 flex flex-col gap-1 z-30">
        <button
          type="button"
          className="w-8 h-8 bg-surface border border-line rounded-md flex items-center justify-center hover:bg-surface-sunken text-ink-700"
          onClick={zoomIn}
          aria-label="Zoom in"
        >
          <Plus size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="w-8 h-8 bg-surface border border-line rounded-md flex items-center justify-center hover:bg-surface-sunken text-ink-700"
          onClick={zoomOut}
          aria-label="Zoom out"
        >
          <Minus size={16} strokeWidth={1.75} />
        </button>
      </div>

      <div className="absolute bottom-4 left-4 flex gap-2 z-30">
        <button
          type="button"
          onClick={() => setMapOrientation("vertical")}
          className={cn(
            "px-3 py-1.5 text-xs rounded-md border transition-colors duration-150",
            mapOrientation === "vertical"
              ? "bg-accent-tint border-accent text-accent"
              : "bg-surface border-line text-ink-500 hover:text-ink-700",
          )}
        >
          ↓ Vertical
        </button>
        <button
          type="button"
          onClick={() => setMapOrientation("horizontal")}
          className={cn(
            "px-3 py-1.5 text-xs rounded-md border transition-colors duration-150",
            mapOrientation === "horizontal"
              ? "bg-accent-tint border-accent text-accent"
              : "bg-surface border-line text-ink-500 hover:text-ink-700",
          )}
        >
          → Horizontal
        </button>
      </div>
    </div>
  );
}