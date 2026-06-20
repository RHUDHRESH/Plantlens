import { z } from "zod";

export const componentCategorySchema = z.enum([
  "power_electrical",
  "actuation_mechanical",
  "process_physical",
  "sensors",
]);

export const visualAssetSchema = z.object({
  icon_kind: z.enum(["inline_svg", "render_hint"]),
  icon_svg: z.string().optional(),
  node_shape: z.string(),
  low_poly_shape: z.string(),
  accent_role: z.string(),
  preview_label: z.string(),
  size_hint: z.object({ width: z.number(), height: z.number() }),
});

export const componentTemplateSchema = z.object({
  component_type_id: z.string(),
  display_name: z.string(),
  category: componentCategorySchema,
  description: z.string(),
  version: z.string(),
  manufacturer_neutral: z.literal(true),
  physical_domain: z.string(),
  ports: z.array(z.object({
    port_id: z.string(),
    name: z.string(),
    direction: z.enum(["input", "output", "bidirectional"]),
    medium: z.string(),
    quantity_kind: z.string(),
    required: z.boolean(),
  })),
  signal_templates: z.array(z.object({
    signal_template_id: z.string(),
    name: z.string(),
    quantity_kind: z.string(),
    unit: z.string(),
  })),
  fault_modes: z.array(z.object({
    fault_mode_id: z.string(),
    title: z.string(),
    severity: z.string(),
    operator_actions: z.array(z.string()),
  })),
  recommended_sensors: z.array(z.string()),
  safety_notes: z.array(z.string()),
  tags: z.array(z.string()),
  visual_asset: visualAssetSchema,
});

export const componentLibraryResponseSchema = z.object({
  status: z.literal("ok"),
  count: z.number().int().min(24),
  library_id: z.string(),
  version: z.string(),
  components: z.array(componentTemplateSchema),
  categories: z.record(z.array(componentTemplateSchema)),
});

export type ComponentTemplateZ = z.infer<typeof componentTemplateSchema>;
export type ComponentLibraryResponseZ = z.infer<typeof componentLibraryResponseSchema>;