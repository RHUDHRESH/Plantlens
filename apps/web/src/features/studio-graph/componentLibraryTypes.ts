/** Mirrors packages/contracts/component_library.schema.json */

export type ComponentCategory =
  | "power_electrical"
  | "actuation_mechanical"
  | "process_physical"
  | "sensors";

export interface Port {
  port_id: string;
  name: string;
  direction: "input" | "output" | "bidirectional";
  medium: string;
  quantity_kind: string;
  required: boolean;
  nominal_range?: { min?: number | null; max?: number | null };
  compatibility_tags?: string[];
}

export interface SignalTemplate {
  signal_template_id: string;
  name: string;
  quantity_kind: string;
  unit: string;
}

export interface FaultMode {
  fault_mode_id: string;
  title: string;
  severity: string;
  operator_actions: string[];
}

export interface VisualAsset {
  icon_kind: "inline_svg" | "render_hint";
  icon_svg?: string;
  node_shape: string;
  low_poly_shape: string;
  accent_role: string;
  preview_label: string;
  size_hint: { width: number; height: number };
  port_layout?: {
    left: string[];
    right: string[];
    top: string[];
    bottom: string[];
  };
}

export interface ComponentTemplate {
  component_type_id: string;
  display_name: string;
  category: ComponentCategory;
  description: string;
  version: string;
  manufacturer_neutral: true;
  physical_domain: string;
  ports: Port[];
  signal_templates: SignalTemplate[];
  fault_modes: FaultMode[];
  recommended_sensors: string[];
  safety_notes: string[];
  tags: string[];
  visual_asset: VisualAsset;
}

export interface ComponentLibraryResponse {
  status: "ok";
  count: number;
  library_id: string;
  version: string;
  components: ComponentTemplate[];
  categories: Record<ComponentCategory, ComponentTemplate[]>;
}

export interface ComponentDetailResponse {
  status: "ok";
  component: ComponentTemplate;
}

export const CATEGORY_LABELS: Record<ComponentCategory, string> = {
  power_electrical: "Power / Electrical",
  actuation_mechanical: "Actuation / Mechanical",
  process_physical: "Process / Physical",
  sensors: "Sensors",
};