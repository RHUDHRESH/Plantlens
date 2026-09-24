import { Handle, Position, useConnection, type Node, type NodeProps } from "@xyflow/react";
import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { AssetInstance } from "../../../app/schemas/plantAssembly";
import { PriorityGlyph } from "../../../components/ui/primitives";
import { evaluateConnection } from "../../connection-rules/engine";
import { mediumColor, mediumDash } from "../../connection-rules/media";
import type { Verdict } from "../../connection-rules/types";
import type { ComponentTemplate, Port } from "../componentLibraryTypes";
import { cachedLayout, type PlacedPort } from "../model/portLayout";
import { useStudioStore } from "../studioStore";
import { ComponentSymbol } from "./ComponentSymbol";
import { useEngineRef, useHoverStore } from "./engineRef";

export interface EquipmentNodeData extends Record<string, unknown> {
  asset: AssetInstance;
  template: ComponentTemplate | undefined;
  issue: "deny" | "warn" | null;
  renaming: boolean;
  readOnly: boolean;
  /** Connected port ids joined with "|" (a string keeps memo comparisons cheap). */
  connectedKey: string;
}

export type EquipmentFlowNode = Node<EquipmentNodeData, "equipment">;

/** `${nodeId}|${handleId}` of the handle a connection is being dragged from, or null. */
function selectConnectingFrom(s: { inProgress: boolean; fromNode?: { id: string } | null; fromHandle?: { id?: string | null } | null }) {
  return s.inProgress && s.fromNode && s.fromHandle?.id ? `${s.fromNode.id}|${s.fromHandle.id}` : null;
}

export function MediumChip({ medium }: { medium: string }) {
  return (
    <svg className="st-medium-chip" width="14" height="6" viewBox="0 0 14 6" aria-hidden>
      <line x1="1" y1="3" x2="13" y2="3" style={{ stroke: mediumColor(medium), strokeDasharray: mediumDash(medium) }} />
    </svg>
  );
}

function PortRow({ placed, connected, verdict }: { placed: PlacedPort; connected: boolean; verdict: Verdict | "origin" | null }) {
  const { port } = placed;
  return (
    <div
      className="st-port-row"
      data-side={placed.side}
      data-full={placed.fullWidth || undefined}
      data-verdict={verdict ?? undefined}
      style={{ top: placed.offsetY - 10 }}
    >
      {placed.side === "right" ? <MediumChip medium={port.medium} /> : null}
      <span className="st-port-row__name" title={port.name}>
        {port.name}
        {port.required ? <span className="st-port-row__req" aria-label="required">*</span> : null}
      </span>
      {placed.side === "left" ? <MediumChip medium={port.medium} /> : null}
      <span className="st-sr-only">{connected ? "connected" : "free"}</span>
    </div>
  );
}

function PortHandle({
  nodeId,
  placed,
  connected,
  verdict,
  readOnly,
}: {
  nodeId: string;
  placed: PlacedPort;
  connected: boolean;
  verdict: Verdict | "origin" | null;
  readOnly: boolean;
}) {
  const { port } = placed;
  const setHover = useHoverStore((s) => s.set);
  return (
    <Handle
      type="source"
      id={port.port_id}
      position={placed.side === "left" ? Position.Left : Position.Right}
      isConnectable={!readOnly}
      className="st-handle"
      data-direction={port.direction}
      data-connected={connected || undefined}
      data-verdict={verdict ?? undefined}
      aria-label={`${port.name} (${port.direction}, ${port.medium})`}
      style={{ top: placed.offsetY, ["--port-color" as string]: mediumColor(port.medium) }}
      onPointerEnter={() => setHover({ nodeId, portId: port.port_id })}
      onPointerLeave={() => setHover(null)}
    />
  );
}

function RenameField({ asset }: { asset: AssetInstance }) {
  const [value, setValue] = useState(asset.display_name);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    const store = useStudioStore.getState();
    if (commit) store.renameAsset(asset.asset_id, value);
    else store.startRename(null);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === "Enter") finish(true);
    if (e.key === "Escape") finish(false);
  };
  return (
    <input
      ref={ref}
      className="st-node__rename nodrag nopan"
      value={value}
      aria-label="Component label"
      maxLength={80}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => finish(true)}
    />
  );
}

function EquipmentNodeImpl({ id, data, selected, dragging }: NodeProps<EquipmentFlowNode>) {
  const { asset, template, issue, renaming, readOnly, connectedKey } = data;
  const layout = cachedLayout(template?.ports ?? EMPTY_PORTS);
  const connected = useMemo(() => new Set(connectedKey ? connectedKey.split("|") : []), [connectedKey]);
  const connectingFrom = useConnection(selectConnectingFrom);
  const engineRef = useEngineRef();

  // While a connection is dragged, colour every port of this node by what the rules would say.
  const verdicts = useMemo(() => {
    if (!connectingFrom || !template) return null;
    const snap = engineRef.current;
    if (!snap) return null;
    const [fromNode, fromHandle] = connectingFrom.split("|") as [string, string];
    const out: Record<string, Verdict | "origin"> = {};
    for (const port of template.ports) {
      if (fromNode === id && fromHandle === port.port_id) {
        out[port.port_id] = "origin";
        continue;
      }
      out[port.port_id] = evaluateConnection(
        snap.ctx,
        snap.rules,
        { fromAssetId: fromNode, fromPortId: fromHandle, toAssetId: id, toPortId: port.port_id },
        { ignoreConnectionId: snap.reconnectingEdgeId },
      ).verdict;
    }
    return out;
  }, [connectingFrom, template, id, engineRef]);

  const status = issue === "deny" ? "critical" : issue === "warn" ? "medium" : "normal";
  const placed = [...layout.left, ...layout.right];
  const anyValid = verdicts ? Object.values(verdicts).some((v) => v === "allow" || v === "warn") : false;

  return (
    <div
      className="st-node"
      data-selected={selected || undefined}
      data-dragging={dragging || undefined}
      data-issue={issue ?? undefined}
      data-connecting={verdicts ? (anyValid ? "target" : "blocked") : undefined}
      style={{ width: layout.width, height: layout.height }}
    >
      <div className="st-node__head">
        <ComponentSymbol componentTypeId={asset.component_type_id} size={34} status={status} />
        <div className="st-node__titles">
          {renaming && !readOnly ? (
            <RenameField asset={asset} />
          ) : (
            <div className="st-node__name" title={asset.display_name}>
              {asset.display_name}
            </div>
          )}
          <div className="st-node__id pl-mono">{asset.asset_id}</div>
        </div>
        {issue ? (
          <span className="st-node__issue" title={issue === "deny" ? "Rule violation" : "Rule warning"}>
            <PriorityGlyph status={status} title={issue === "deny" ? "Rule violation" : "Rule warning"} size={11} />
          </span>
        ) : null}
      </div>
      {!template ? <div className="st-node__unknown">Unknown component type</div> : null}
      {placed.map((p) => (
        <PortRow key={p.port.port_id} placed={p} connected={connected.has(p.port.port_id)} verdict={verdicts?.[p.port.port_id] ?? null} />
      ))}
      {placed.map((p) => (
        <PortHandle
          key={p.port.port_id}
          nodeId={id}
          placed={p}
          connected={connected.has(p.port.port_id)}
          verdict={verdicts?.[p.port.port_id] ?? null}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}

const EMPTY_PORTS: Port[] = [];

export const EquipmentNode = memo(EquipmentNodeImpl);
