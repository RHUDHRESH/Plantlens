import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { ComponentIcon } from "./ComponentIcon";
import { PortHandle } from "./PortHandle";
import type { ComponentTemplate } from "./componentLibraryTypes";

export interface AssemblyNodeData {
  assetId: string;
  displayName: string;
  category: string;
  template: ComponentTemplate;
  hasSafety: boolean;
}

export const AssemblyNode = memo(function AssemblyNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as AssemblyNodeData;
  const { template, displayName, category, hasSafety } = nodeData;
  const layout = template.visual_asset.port_layout ?? { left: [], right: [], top: [], bottom: [] };
  const portMap = new Map(template.ports.map((p) => [p.port_id, p]));

  const renderSide = (side: "left" | "right" | "top" | "bottom") =>
    (layout[side] ?? [])
      .map((portId) => portMap.get(portId))
      .filter(Boolean)
      .map((port) => <PortHandle key={`${side}-${port!.port_id}`} port={port!} side={side} />);

  return (
    <div className={`assembly-node ${selected ? "assembly-node--selected" : ""}`}>
      <header className="assembly-node__header">
        <ComponentIcon
          svg={template.visual_asset.icon_svg}
          label={template.visual_asset.preview_label}
          accentRole={template.visual_asset.accent_role}
          size={40}
        />
        <div>
          <strong>{displayName}</strong>
          <span className="assembly-node__category">{category.replace(/_/g, " ")}</span>
        </div>
        {hasSafety ? <span className="assembly-node__safety">!</span> : null}
      </header>
      <div className="assembly-node__ports assembly-node__ports--left">{renderSide("left")}</div>
      <div className="assembly-node__ports assembly-node__ports--right">{renderSide("right")}</div>
      <div className="assembly-node__ports assembly-node__ports--top">{renderSide("top")}</div>
      <div className="assembly-node__ports assembly-node__ports--bottom">{renderSide("bottom")}</div>
    </div>
  );
});