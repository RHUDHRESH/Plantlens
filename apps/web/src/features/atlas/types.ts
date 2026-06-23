import type { TagQuality } from "../../app/schemas/common";

export type MapOrientation = "vertical" | "horizontal";

export interface AtlasTreeNode {
  id: string;
  label: string;
  expanded?: boolean;
  children?: AtlasTreeNode[];
  equipment_id?: string;
  tags?: string[];
}

export interface PlantLayoutPositions {
  vertical: Record<string, { x: number; y: number }>;
  horizontal: Record<string, { x: number; y: number }>;
}

export interface EquipmentMapInfo {
  label: string;
  width: number;
  height: number;
  primaryTag?: string;
  unit?: string;
}

export type DataQuality = TagQuality;