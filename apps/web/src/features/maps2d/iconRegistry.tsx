import type { ReactNode } from "react";

/** Maps plant.schema asset `type` keys to monochrome schematic symbols (currentColor). */
const ASSET_TYPE_ICON: Record<string, string> = {
  "source.solar": "solar",
  "control.charge_controller": "charge_controller",
  "storage.battery": "battery",
  "distribution.dc_bus": "dc_bus",
  "distribution.breaker": "breaker",
  "drive.inverter": "inverter",
  "load.motor_3phase": "motor",
  "load.lamp": "lamp",
  "sensor.generic": "sensor",
};

const ICON_PATHS: Record<string, ReactNode> = {
  solar: (
    <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round">
      <rect x="3" y="8" width="18" height="10" rx="1" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="9" y1="8" x2="9" y2="18" />
      <line x1="15" y1="8" x2="15" y2="18" />
    </g>
  ),
  charge_controller: (
    <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round">
      <rect x="4" y="5" width="16" height="14" rx="1.5" />
      <rect x="7" y="8" width="6" height="4" rx="0.5" />
      <line x1="16" y1="9" x2="18" y2="9" />
      <line x1="16" y1="12" x2="18" y2="12" />
      <line x1="16" y1="15" x2="18" y2="15" />
    </g>
  ),
  battery: (
    <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round">
      <rect x="3" y="7" width="16" height="12" rx="1.5" />
      <rect x="19" y="10" width="2" height="6" rx="0.5" />
      <line x1="6" y1="10" x2="6" y2="16" />
      <line x1="9" y1="10" x2="9" y2="16" />
      <line x1="12" y1="10" x2="12" y2="16" />
      <line x1="15" y1="10" x2="15" y2="16" />
    </g>
  ),
  dc_bus: (
    <g stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round">
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="6" y1="8" x2="6" y2="16" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="18" y1="8" x2="18" y2="16" />
    </g>
  ),
  breaker: (
    <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round">
      <rect x="8" y="3" width="8" height="18" rx="1" />
      <line x1="12" y1="6" x2="12" y2="10" />
      <line x1="12" y1="10" x2="15" y2="14" />
      <line x1="12" y1="18" x2="12" y2="21" />
    </g>
  ),
  inverter: (
    <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <path d="M8 16 L11 8 L14 16" />
      <line x1="9.5" y1="13" x2="12.5" y2="13" />
      <line x1="16" y1="8" x2="16" y2="16" />
      <line x1="18" y1="8" x2="18" y2="16" />
    </g>
  ),
  motor: (
    <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round">
      <circle cx="12" cy="11" r="5" />
      <line x1="17" y1="11" x2="21" y2="11" />
      <line x1="21" y1="9" x2="21" y2="13" />
      <rect x="6" y="17" width="12" height="3" rx="0.5" />
    </g>
  ),
  lamp: (
    <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M8 14h8l-1-6a4 4 0 0 0-6 0z" />
    </g>
  ),
  sensor: (
    <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round">
      <circle cx="12" cy="12" r="3" />
      <line x1="12" y1="2" x2="12" y2="5" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="2" y1="12" x2="5" y2="12" />
      <line x1="19" y1="12" x2="22" y2="12" />
    </g>
  ),
  generic: (
    <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round">
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <line x1="9" y1="12" x2="15" y2="12" />
    </g>
  ),
};

export function resolveIconKey(assetType: string): string {
  if (assetType in ASSET_TYPE_ICON) return ASSET_TYPE_ICON[assetType]!;
  if (assetType.startsWith("sensor.")) return "sensor";
  return "generic";
}

export function AssetIcon({ assetType, size = 28 }: { assetType: string; size?: number }) {
  const key = resolveIconKey(assetType);
  const x = (120 - size) / 2;
  const y = 6;
  return (
    <svg
      x={x}
      y={y}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      className="plant-node__icon"
    >
      {ICON_PATHS[key] ?? ICON_PATHS.generic}
    </svg>
  );
}

export const DEMO_ASSET_TYPES = Object.keys(ASSET_TYPE_ICON);