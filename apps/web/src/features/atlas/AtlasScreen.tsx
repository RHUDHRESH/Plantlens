import { useCallback, useMemo } from "react";
import type { ActiveAlarm } from "../../api/types";
import type { CalmCard } from "../../app/schemas/calmCard";
import type { Situation } from "../../app/schemas/situation";
import type { TagFrame } from "../../app/schemas/tagFrame";
import { useAtlasStore } from "../../app/store/atlas";
import { cn } from "../../lib/cn";
import { AssetTree } from "./AssetTree";
import { AtlasPlantMap } from "./AtlasPlantMap";
import { PlantHealthPanel } from "./PlantHealthPanel";
import { SituationPanel } from "./SituationPanel";
import { StatusStrip } from "./StatusStrip";
import { countDegradedTags } from "./treeHelpers";

export interface AtlasScreenProps {
  tags: Record<string, TagFrame>;
  assetStatus: Record<string, string>;
  activeSituation: Situation | null;
  situations: Situation[];
  calmCard: CalmCard | null;
  alarms: ActiveAlarm[];
  reducedMotion?: boolean;
  plantHealthy?: boolean;
  rawAlarmsExpanded?: boolean;
  onSelectEquipment: (equipmentId: string) => void;
  onViewRawAlarms: () => void;
  onEscalate?: () => void;
  onHighlightAsset?: (assetId: string) => void;
  onFocusRoot?: () => void;
  escalating?: boolean;
  rawAlarmTable?: React.ReactNode;
}

export function AtlasScreen({
  tags,
  assetStatus,
  activeSituation,
  situations,
  calmCard,
  alarms,
  reducedMotion = false,
  plantHealthy = true,
  onSelectEquipment,
  onViewRawAlarms,
  onEscalate,
  onHighlightAsset,
  onFocusRoot,
  escalating,
  rawAlarmTable,
}: AtlasScreenProps) {
  const selectEquipment = useAtlasStore((s) => s.selectEquipment);
  const situationActive = Boolean(activeSituation);
  const degradedTagCount = useMemo(() => countDegradedTags(tags), [tags]);

  const handleSelectEquipment = useCallback(
    (equipmentId: string) => {
      selectEquipment(equipmentId);
      onSelectEquipment(equipmentId);
    },
    [onSelectEquipment, selectEquipment],
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      <div className="flex flex-1 min-h-0 gap-0 bg-canvas relative">
        <AssetTree
          className="w-[220px] shrink-0 border-r border-line bg-surface flex flex-col"
          tags={tags}
          situations={situations}
          assetStatus={assetStatus}
          onSelectEquipment={handleSelectEquipment}
        />

        <div className="flex-1 min-w-0 relative overflow-hidden">
          <AtlasPlantMap
            tags={tags}
            activeSituation={activeSituation}
            reducedMotion={reducedMotion}
            onSelectEquipment={handleSelectEquipment}
          />
        </div>

        <div
          className={cn(
            "absolute right-0 top-0 bottom-0 w-[360px] bg-surface border-l border-line",
            "transition-transform duration-[240ms] ease-out z-40 shadow-e2",
            situationActive ? "translate-x-0" : "translate-x-full",
          )}
          aria-hidden={!situationActive}
        >
          {situationActive && activeSituation ? (
            <SituationPanel
              situation={activeSituation}
              calmCard={calmCard}
              onViewRawAlarms={onViewRawAlarms}
              {...(onEscalate ? { onEscalate } : {})}
              {...(onHighlightAsset ? { onHighlightAsset } : {})}
              {...(onFocusRoot ? { onFocusRoot } : {})}
              escalating={escalating ?? false}
            />
          ) : null}
        </div>

        {!situationActive && (
          <div className="absolute right-0 top-0 bottom-0 w-[360px] bg-surface border-l border-line z-30 shadow-e2">
            <PlantHealthPanel tags={tags} alarms={alarms} />
          </div>
        )}
      </div>

      <StatusStrip
        situations={situations}
        alarms={alarms}
        plantHealthy={plantHealthy}
        degradedTagCount={degradedTagCount}
        onViewRawAlarms={onViewRawAlarms}
      />

      {rawAlarmTable}
    </div>
  );
}