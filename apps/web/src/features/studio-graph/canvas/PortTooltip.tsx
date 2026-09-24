/**
 * One shared tooltip for all port handles (cheaper than a Radix tooltip per handle on 200 nodes).
 * Idle: port facts. While connecting: the rule verdict for the hovered target, with the reason.
 */
import { useConnection } from "@xyflow/react";
import { useLayoutEffect, useRef, useState } from "react";
import { evaluateConnection, fanLimitFor, portConnectionIds, primaryReason, resolveEnd } from "../../connection-rules/engine";
import { formatRange, mediumLabel } from "../../connection-rules/media";
import { useEngineRef, useHoverStore } from "./engineRef";
import { MediumChip } from "./EquipmentNode";

function selectTarget(s: { inProgress: boolean; fromNode?: { id: string } | null; fromHandle?: { id?: string | null } | null; toNode?: { id: string } | null; toHandle?: { id?: string | null } | null }) {
  if (!s.inProgress || !s.fromNode || !s.fromHandle?.id) return null;
  return {
    key: `${s.fromNode.id}|${s.fromHandle.id}|${s.toNode?.id ?? ""}|${s.toHandle?.id ?? ""}`,
  };
}

function handleEl(nodeId: string, portId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.react-flow__handle[data-nodeid="${CSS.escape(nodeId)}"][data-handleid="${CSS.escape(portId)}"]`);
}

export function PortTooltip() {
  const hover = useHoverStore((s) => s.port);
  const connecting = useConnection(selectTarget)?.key ?? null;
  const engineRef = useEngineRef();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  let anchor: { nodeId: string; portId: string } | null = null;
  let content: React.ReactNode = null;
  let tone: "info" | "allow" | "warn" | "deny" = "info";
  const snap = engineRef.current;

  if (snap && connecting) {
    const [fromNode, fromHandle, toNode, toHandle] = connecting.split("|") as [string, string, string, string];
    if (toNode && toHandle) {
      anchor = { nodeId: toNode, portId: toHandle };
      const evaluation = evaluateConnection(
        snap.ctx,
        snap.rules,
        { fromAssetId: fromNode, fromPortId: fromHandle, toAssetId: toNode, toPortId: toHandle },
        { ignoreConnectionId: snap.reconnectingEdgeId },
      );
      tone = evaluation.verdict;
      const reason = primaryReason(evaluation);
      const target = resolveEnd(snap.ctx, toNode, toHandle);
      content = (
        <>
          <div className="st-port-tip__title">
            <span className="st-port-tip__verdict">{evaluation.verdict === "deny" ? "Not allowed" : evaluation.verdict === "warn" ? "Allowed with warning" : "Compatible"}</span>
            {target ? <span className="st-port-tip__sub">{target.asset.display_name} · {target.port.name}</span> : null}
          </div>
          {reason ? <p className="st-port-tip__reason">{reason.message}</p> : null}
          {reason?.fix ? <p className="st-port-tip__fix">Fix: {reason.fix}</p> : null}
          {evaluation.overriddenBy ? <p className="st-port-tip__fix">Allowed by custom rule “{evaluation.overriddenBy}”.</p> : null}
        </>
      );
    }
  } else if (snap && hover) {
    const end = resolveEnd(snap.ctx, hover.nodeId, hover.portId);
    if (end) {
      anchor = hover;
      const { port } = end;
      const used = portConnectionIds(snap.ctx, hover.nodeId, hover.portId).length;
      const limit = fanLimitFor(snap.rules, port.medium);
      const max = port.direction === "input" ? limit.fan_in : port.direction === "output" ? limit.fan_out : (limit.fan_in ?? limit.fan_out);
      const range = formatRange(port.nominal_range, port.quantity_kind);
      content = (
        <>
          <div className="st-port-tip__title">
            <strong>{port.name}</strong>
            <span className="st-port-tip__sub pl-mono">{port.port_id}</span>
          </div>
          <dl className="st-port-tip__facts">
            <dt>Medium</dt>
            <dd>
              <MediumChip medium={port.medium} /> {mediumLabel(port.medium)}
            </dd>
            <dt>Direction</dt>
            <dd>{port.direction}</dd>
            <dt>Quantity</dt>
            <dd>{port.quantity_kind.replace(/_/g, " ")}</dd>
            {range ? (
              <>
                <dt>Nominal</dt>
                <dd className="pl-mono">{range}</dd>
              </>
            ) : null}
            <dt>Connections</dt>
            <dd className="pl-mono">
              {used} / {max ?? "∞"}
            </dd>
          </dl>
          {port.required && used === 0 ? <p className="st-port-tip__fix">Required — not connected yet.</p> : null}
        </>
      );
    }
  }

  const anchorKey = anchor ? `${anchor.nodeId}|${anchor.portId}` : null;
  useLayoutEffect(() => {
    if (!anchorKey || !ref.current) {
      setPos(null);
      return;
    }
    const [n, p] = anchorKey.split("|") as [string, string];
    const el = handleEl(n, p);
    const host = ref.current.offsetParent as HTMLElement | null;
    if (!el || !host) {
      setPos(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const h = host.getBoundingClientRect();
    setPos({ left: r.left + r.width / 2 - h.left, top: r.top - h.top });
  }, [anchorKey, connecting]);

  return (
    <div
      ref={ref}
      className="st-port-tip"
      role="tooltip"
      data-tone={tone}
      hidden={!content}
      style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden" }}
    >
      {content}
    </div>
  );
}
