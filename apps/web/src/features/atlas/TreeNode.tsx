import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";
import type { AtlasTreeNode, DataQuality } from "./types";
import { formatTreeValue, getUnitForTag } from "./treeHelpers";

interface TreeNodeProps {
  node: AtlasTreeNode;
  depth: number;
  isExpanded: (nodeId: string, defaultExpanded?: boolean) => boolean;
  onSelectEquipment: (equipmentId: string) => void;
  onToggleExpanded: (nodeId: string) => void;
  selectedEquipmentId?: string | null;
  qualityByEquipment: Record<string, DataQuality>;
  valuesByTag: Record<string, number | null>;
}

const DOT_CLASS: Record<DataQuality | "unknown", string> = {
  BAD: "bg-critical",
  UNCERTAIN: "bg-advisory",
  GOOD: "bg-healthy",
  STALE: "bg-advisory",
  MISSING: "bg-line-strong",
  unknown: "bg-line-strong",
};

export function TreeNode({
  node,
  depth,
  isExpanded,
  onSelectEquipment,
  onToggleExpanded,
  selectedEquipmentId,
  qualityByEquipment,
  valuesByTag,
}: TreeNodeProps) {
  const isSelected = node.equipment_id === selectedEquipmentId;
  const hasChildren = Boolean(node.children?.length);
  const quality = node.equipment_id ? qualityByEquipment[node.equipment_id] : undefined;
  const dotClass = DOT_CLASS[quality ?? "unknown"];
  const leafTag = node.tags?.length === 1 && !hasChildren ? node.tags[0] : undefined;
  const expanded = isExpanded(node.id, node.expanded);

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (node.equipment_id) onSelectEquipment(node.equipment_id);
        }}
        onDoubleClick={() => onToggleExpanded(node.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && node.equipment_id) onSelectEquipment(node.equipment_id);
        }}
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-colors duration-150",
          "hover:bg-surface-sunken",
          isSelected && "bg-accent-tint border-l-[3px] border-accent",
        )}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpanded(node.id);
            }}
            className="shrink-0 w-4 h-4 flex items-center justify-center text-ink-500"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            <ChevronDown
              size={14}
              strokeWidth={1.75}
              className={cn("transition-transform duration-150", !expanded && "-rotate-90")}
            />
          </button>
        ) : (
          <div className="shrink-0 w-4" />
        )}

        <div className={cn("shrink-0 w-1.5 h-1.5 rounded-full", dotClass)} aria-hidden />

        <span className="text-sm text-ink-900 truncate">{node.label}</span>

        {leafTag && (
          <span className="text-xs text-ink-500 font-mono ml-auto shrink-0 tabular-nums">
            {formatTreeValue(leafTag, valuesByTag[leafTag] ?? null)} {getUnitForTag(leafTag)}
          </span>
        )}
      </div>

      {expanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              isExpanded={isExpanded}
              onSelectEquipment={onSelectEquipment}
              onToggleExpanded={onToggleExpanded}
              selectedEquipmentId={selectedEquipmentId ?? null}
              qualityByEquipment={qualityByEquipment}
              valuesByTag={valuesByTag}
            />
          ))}
        </div>
      )}
    </div>
  );
}