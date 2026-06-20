import { z } from "zod";

export const coords2dSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const assetInstanceSchema = z.object({
  asset_id: z.string(),
  component_type_id: z.string(),
  display_name: z.string(),
  position_2d: coords2dSchema,
  position_3d: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
  configured_ports: z.array(z.string()).default([]),
  configured_signals: z.array(z.string()).default([]),
  overrides: z.record(z.unknown()).default({}),
  enabled_fault_modes: z.array(z.string()).default([]),
});

export const plantConnectionSchema = z.object({
  connection_id: z.string(),
  from_asset_id: z.string(),
  from_port_id: z.string(),
  to_asset_id: z.string(),
  to_port_id: z.string(),
  connection_kind: z.enum(["power", "signal", "mechanical", "airflow", "fluid", "mounting", "data"]),
  approved: z.boolean(),
  lag_min_ms: z.number().int().nonnegative(),
  lag_max_ms: z.number().int().nonnegative(),
  notes: z.string().optional().default(""),
});

export const plantAssemblySchema = z.object({
  assembly_id: z.string(),
  plant_id: z.string(),
  version: z.string(),
  assets: z.array(assetInstanceSchema),
  connections: z.array(plantConnectionSchema),
  global_tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
});

export type Coords2D = z.infer<typeof coords2dSchema>;
export type AssetInstance = z.infer<typeof assetInstanceSchema>;
export type PlantConnection = z.infer<typeof plantConnectionSchema>;
export type PlantAssembly = z.infer<typeof plantAssemblySchema>;

export interface CompatibilityResult {
  compatible: boolean;
  severity: "ok" | "warning" | "error";
  reason: string;
  warnings: string[];
  required_adapters: string[];
  from_medium?: string;
  to_medium?: string;
  from_quantity_kind?: string;
  to_quantity_kind?: string;
}