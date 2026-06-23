import type { Situation } from "../../app/schemas/situation";
import type { TagFrame } from "../../app/schemas/tagFrame";
import { cn } from "../../lib/cn";
import { AtlasCausalPathOverlay } from "./AtlasCausalPathOverlay";
import { EQUIPMENT_INFO, PLANT_CONNECTIONS } from "./plantLayout";
import { tagNumericValue } from "./treeHelpers";

interface AtlasSVGMapProps {
  positions: Record<string, { x: number; y: number }>;
  selectedEquipmentId?: string | null;
  activeSituation?: Situation | null;
  causalPath?: string[] | null;
  tags: Record<string, TagFrame>;
  reducedMotion?: boolean;
  onSelectEquipment: (id: string) => void;
}

function affectedIds(situation: Situation | null | undefined): string[] {
  if (!situation) return [];
  return situation.affected_asset_ids ?? [];
}

function nodeClasses(equipmentId: string, situation: Situation | null | undefined): string {
  if (!situation) return "fill-canvas stroke-line-strong";
  const affected = affectedIds(situation);
  const root = situation.root_asset_id;
  if (equipmentId === root) return "fill-critical-tint stroke-critical";
  if (affected.includes(equipmentId)) return "fill-warning-tint stroke-warning";
  return "fill-canvas stroke-line-strong";
}

export function AtlasSVGMap({
  positions,
  selectedEquipmentId,
  activeSituation,
  causalPath,
  tags,
  reducedMotion = false,
  onSelectEquipment,
}: AtlasSVGMapProps) {
  const coords = Object.values(positions);
  if (!coords.length) {
    return <div className="text-sm text-ink-500 p-6">No map positions available.</div>;
  }

  const xs = coords.map((p) => p.x);
  const ys = coords.map((p) => p.y);
  const minX = Math.min(...xs) - 60;
  const maxX = Math.max(...xs) + 200;
  const minY = Math.min(...ys) - 60;
  const maxY = Math.max(...ys) + 200;
  const viewBox = `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;

  const affected = new Set(affectedIds(activeSituation));
  const pathSet = new Set(causalPath ?? []);

  return (
    <svg viewBox={viewBox} className="w-full h-full" style={{ userSelect: "none" }}>
      <defs>
        <marker id="atlas-arrow-normal" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
          <polygon points="0 0, 10 3, 0 6" fill="var(--line-strong)" />
        </marker>
        <marker id="atlas-arrow-causal" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
          <polygon points="0 0, 10 3, 0 6" fill="var(--critical)" />
        </marker>
        <style>{`
          @keyframes atlas-situation-pulse {
            0%, 100% { opacity: 0.4; }
            50% { opacity: 0.8; }
          }
          .atlas-pulse-ring {
            animation: atlas-situation-pulse 1.8s ease-in-out infinite;
          }
          @media (prefers-reduced-motion: reduce) {
            .atlas-pulse-ring { animation: none; opacity: 0.65; }
          }
        `}</style>
      </defs>

      {PLANT_CONNECTIONS.map(([from, to], index) => {
        const fromPos = positions[from];
        const toPos = positions[to];
        const fromInfo = EQUIPMENT_INFO[from];
        const toInfo = EQUIPMENT_INFO[to];
        if (!fromPos || !toPos || !fromInfo || !toInfo) return null;

        const x1 = fromPos.x + fromInfo.width / 2;
        const y1 = fromPos.y + fromInfo.height;
        const x2 = toPos.x + toInfo.width / 2;
        const y2 = toPos.y;

        const inPath = pathSet.has(from) && pathSet.has(to);
        return (
          <line
            key={`${from}-${to}-${index}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={inPath ? "var(--critical)" : "var(--line-strong)"}
            strokeWidth={inPath ? 2 : 1.5}
            strokeDasharray={inPath ? "6 3" : undefined}
            markerEnd={inPath ? "url(#atlas-arrow-causal)" : "url(#atlas-arrow-normal)"}
          />
        );
      })}

      {Object.entries(positions).map(([equipmentId, pos]) => {
        const info = EQUIPMENT_INFO[equipmentId];
        if (!info) return null;

        const isSelected = selectedEquipmentId === equipmentId;
        const isAffected = affected.has(equipmentId);
        const cx = pos.x + info.width / 2;
        const cy = pos.y + info.height / 2;
        const primaryValue =
          info.primaryTag && tagNumericValue(tags[info.primaryTag]) !== null
            ? tagNumericValue(tags[info.primaryTag])!.toFixed(info.unit === "rpm" ? 0 : 1)
            : "—";

        return (
          <g key={equipmentId}>
            {isAffected && (
              <circle
                cx={cx}
                cy={cy}
                r={Math.max(info.width, info.height) * 0.55}
                fill="none"
                stroke={
                  activeSituation?.root_asset_id === equipmentId
                    ? "var(--critical)"
                    : "var(--warning)"
                }
                strokeWidth={2}
                className={reducedMotion ? undefined : "atlas-pulse-ring"}
              />
            )}

            <rect
              x={pos.x}
              y={pos.y}
              width={info.width}
              height={info.height}
              rx={6}
              className={cn(
                "stroke-[1.5] transition-all duration-200 cursor-pointer",
                nodeClasses(equipmentId, activeSituation),
                isSelected && "stroke-[2.5] stroke-accent",
              )}
              onClick={() => onSelectEquipment(equipmentId)}
            />

            <text
              x={cx}
              y={pos.y + 20}
              textAnchor="middle"
              className="fill-ink-900 font-sans"
              fontSize={12}
              fontWeight={500}
            >
              {info.label}
            </text>

            {info.primaryTag && (
              <text
                x={cx}
                y={pos.y + info.height - 10}
                textAnchor="middle"
                className="fill-ink-500 font-mono tabular-nums"
                fontSize={11}
                fontWeight={500}
              >
                {primaryValue} {info.unit ?? ""}
              </text>
            )}
          </g>
        );
      })}

      {causalPath && causalPath.length > 1 && (
        <AtlasCausalPathOverlay
          causalPath={causalPath}
          positions={positions}
          reducedMotion={reducedMotion}
        />
      )}
    </svg>
  );
}