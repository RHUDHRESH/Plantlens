import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { FaultMatrix, FaultMatrixScore } from "../../app/schemas/faultMatrix";
import type { TagFrame } from "../../app/schemas/tagFrame";
import { FaultMatrixPanel } from "./FaultMatrixPanel";
import { SignalRail } from "./SignalRail";

export interface MonitorScreenProps {
  tags: Record<string, TagFrame>;
  scores?: FaultMatrixScore[];
  matrix?: FaultMatrix | null;
  selectedFaultId?: string | null;
  onSelectFault?: (faultId: string) => void;
  calmCardSlot?: ReactNode;
  mapSlot?: ReactNode;
  mapToolbarSlot?: ReactNode;
  showMap?: boolean;
  onToggleMap?: () => void;
  className?: string;
}

export function MonitorScreen({
  tags,
  scores = [],
  matrix = null,
  selectedFaultId = null,
  onSelectFault,
  calmCardSlot,
  mapSlot,
  mapToolbarSlot,
  showMap = false,
  onToggleMap: _onToggleMap,
  className,
}: MonitorScreenProps) {
  const preferTagIds =
    matrix?.faults
      ?.flatMap((f) => f.symptoms.map((s) => s.tag_id))
      .filter((id, i, arr) => arr.indexOf(id) === i) ?? [];

  return (
    <div
      className={cn(
        "monitor-screen flex min-h-0 flex-1 flex-col gap-2 bg-canvas p-2",
        className,
      )}
      data-testid="monitor-screen"
    >
      <SignalRail tags={tags} preferTagIds={preferTagIds} />

      <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.95fr)]">
        <FaultMatrixPanel
          scores={scores}
          matrix={matrix}
          selectedFaultId={selectedFaultId}
          {...(onSelectFault ? { onSelectFault } : {})}
          className="min-h-0 overflow-hidden rounded-md border border-line bg-surface"
        />
        <aside
          className="monitor-screen__calm flex min-h-0 flex-col overflow-y-auto rounded-md border border-line bg-surface"
          aria-label="Situation card"
        >
          {calmCardSlot}
        </aside>
      </div>

      {showMap ? (
        <div
          className="monitor-screen__map flex min-h-[220px] flex-col overflow-hidden rounded-md border border-line bg-surface"
          data-testid="monitor-map-slot"
        >
          {mapToolbarSlot}
          {mapSlot}
        </div>
      ) : null}
    </div>
  );
}
