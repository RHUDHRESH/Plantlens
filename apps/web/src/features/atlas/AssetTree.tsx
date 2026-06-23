import { useMemo } from "react";
import { useAtlasStore } from "../../app/store/atlas";
import { cn } from "../../lib/cn";
import type { Situation } from "../../app/schemas/situation";
import type { TagFrame } from "../../app/schemas/tagFrame";
import { DEMO_TREE_STRUCTURE } from "./treeStructure";
import { TreeNode } from "./TreeNode";
import { walkTreeForQuality, walkTreeForValues } from "./treeHelpers";
import type { DataQuality } from "./types";

interface AssetTreeProps {
  className?: string;
  tags: Record<string, TagFrame>;
  situations: Situation[];
  assetStatus: Record<string, string>;
  onSelectEquipment: (equipmentId: string) => void;
}

export function AssetTree({ className, tags, situations, assetStatus, onSelectEquipment }: AssetTreeProps) {
  const selectedEquipmentId = useAtlasStore((s) => s.selectedEquipmentId);
  const treeExpanded = useAtlasStore((s) => s.treeExpanded);
  const toggleTreeExpanded = useAtlasStore((s) => s.toggleTreeExpanded);

  const qualityByEquipment = useMemo(() => {
    const result: Record<string, DataQuality> = {};
    DEMO_TREE_STRUCTURE.forEach((node) =>
      walkTreeForQuality(node, tags, situations, assetStatus, result),
    );
    return result;
  }, [tags, situations, assetStatus]);

  const valuesByTag = useMemo(() => {
    const result: Record<string, number | null> = {};
    DEMO_TREE_STRUCTURE.forEach((node) => walkTreeForValues(node, tags, result));
    return result;
  }, [tags]);

  return (
    <div className={cn("overflow-y-auto flex-1", className)}>
      <div className="p-3 text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-2">
        Plant hierarchy
      </div>
      <div className="px-1 pb-3">
        {DEMO_TREE_STRUCTURE.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            isExpanded={(id, defaultExpanded = false) => treeExpanded[id] ?? defaultExpanded}
            onSelectEquipment={onSelectEquipment}
            onToggleExpanded={toggleTreeExpanded}
            selectedEquipmentId={selectedEquipmentId ?? null}
            qualityByEquipment={qualityByEquipment}
            valuesByTag={valuesByTag}
          />
        ))}
      </div>
    </div>
  );
}