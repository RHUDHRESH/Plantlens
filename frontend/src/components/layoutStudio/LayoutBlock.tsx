import type { LayoutBlockModel } from "./layoutStudioTypes";

interface LayoutBlockProps {
  block: LayoutBlockModel;
  selected: boolean;
  editable: boolean;
  onSelect: (id: string) => void;
}

const KIND_CLASS: Record<LayoutBlockModel["kind"], string> = {
  motor: "pl-layout-block--motor",
  fan: "pl-layout-block--fan",
  blower: "pl-layout-block--blower",
  sensor: "pl-layout-block--sensor",
  power: "pl-layout-block--power",
  relay: "pl-layout-block--relay",
  plc: "pl-layout-block--plc",
  group: "pl-layout-block--group",
};

const STATUS_MARKER: Record<LayoutBlockModel["status"], string> = {
  normal: "●",
  warning: "◆",
  critical: "▲",
  unknown: "○",
  draft: "◇",
};

export function LayoutBlock({ block, selected, editable, onSelect }: LayoutBlockProps) {
  return (
    <button
      type="button"
      className={[
        "pl-layout-block",
        KIND_CLASS[block.kind],
        selected ? "pl-layout-block--selected" : "",
        !editable ? "pl-layout-block--readonly" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(block.id);
      }}
      aria-pressed={selected}
      aria-label={`${block.instanceId} ${block.label}, ${block.typeId}`}
    >
      <span className="pl-layout-block__marker" aria-hidden="true">
        {STATUS_MARKER[block.status]}
      </span>
      <span className="pl-layout-block__instance">{block.instanceId}</span>
      <span className="pl-layout-block__label">{block.label}</span>
      <span className="pl-layout-block__type">{block.typeId}</span>
    </button>
  );
}