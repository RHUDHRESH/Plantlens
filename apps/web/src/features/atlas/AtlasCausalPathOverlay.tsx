import { motion } from "motion/react";
import { EQUIPMENT_INFO } from "./plantLayout";

interface AtlasCausalPathOverlayProps {
  causalPath: string[];
  positions: Record<string, { x: number; y: number }>;
  reducedMotion?: boolean;
}

function nodeCenter(equipmentId: string, pos: { x: number; y: number }): [number, number] {
  const info = EQUIPMENT_INFO[equipmentId];
  const w = info?.width ?? 100;
  const h = info?.height ?? 50;
  return [pos.x + w / 2, pos.y + h / 2];
}

export function AtlasCausalPathOverlay({
  causalPath,
  positions,
  reducedMotion = false,
}: AtlasCausalPathOverlayProps) {
  const points = causalPath
    .map((equipmentId) => {
      const pos = positions[equipmentId];
      if (!pos) return null;
      const [cx, cy] = nodeCenter(equipmentId, pos);
      return `${cx},${cy}`;
    })
    .filter(Boolean)
    .join(" ");

  if (!points) return null;

  const motionProps = {
    points,
    stroke: "var(--critical)",
    strokeWidth: 3,
    fill: "none" as const,
    strokeDasharray: "6 3",
    initial: reducedMotion ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 },
    animate: { pathLength: 1, opacity: 1 },
    transition: { duration: reducedMotion ? 0 : 0.8, ease: "easeOut" as const },
    ...(reducedMotion ? {} : { exit: { pathLength: 0, opacity: 0 } }),
  };

  return <motion.polyline {...motionProps} />;
}