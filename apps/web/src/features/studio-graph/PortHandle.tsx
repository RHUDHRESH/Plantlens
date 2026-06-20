import { Handle, Position } from "@xyflow/react";
import type { Port } from "./componentLibraryTypes";

const SIDE_POSITION: Record<string, Position> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
};

interface PortHandleProps {
  port: Port;
  side: "left" | "right" | "top" | "bottom";
}

export function PortHandle({ port, side }: PortHandleProps) {
  const position = SIDE_POSITION[side] ?? Position.Right;
  const isSource = port.direction === "output" || port.direction === "bidirectional";
  const isTarget = port.direction === "input" || port.direction === "bidirectional";

  return (
    <div className={`assembly-port assembly-port--${side}`} title={`${port.name} (${port.medium})`}>
      <span className="assembly-port__label">{port.name}</span>
      {isTarget ? (
        <Handle
          type="target"
          position={position}
          id={port.port_id}
          className={`assembly-port__handle assembly-port__handle--${port.medium}`}
        />
      ) : null}
      {isSource ? (
        <Handle
          type="source"
          position={position}
          id={port.port_id}
          className={`assembly-port__handle assembly-port__handle--${port.medium}`}
        />
      ) : null}
      <span className="assembly-port__meta">{port.medium}</span>
    </div>
  );
}