import { apiFetch } from "../../api/client";
import type { PlantAssembly } from "../../app/schemas/plantAssembly";

export type AnalysisResult = {
  status: "ok" | "error";
  fault_signature_matrix?: {
    assembly_id: string;
    fault_count: number;
    faults: Array<{ fault_key: string; severity: string }>;
  };
  observability_matrix?: {
    summary: {
      total_faults: number;
      observable_faults: number;
      weakly_observable_faults: number;
      unobservable_faults: number;
      average_confidence_ceiling: number;
    };
    fault_observability: Array<{
      fault_key: string;
      observability_class: string;
      confidence_ceiling: number;
      missing_required_signals: string[];
      explanation: string;
    }>;
  };
  causal_propagation_matrix?: {
    monitoring_edges_excluded_count: number;
    unapproved_edges_excluded_count: number;
    errors: Array<{ code: string; message: string }>;
    active_propagation_paths: Array<{ from_asset_id: string; to_asset_id: string }>;
  };
  sensor_recommendations?: {
    coverage_before: number;
    coverage_after: number;
    recommended_sensors: Array<{
      component_type_id: string;
      measured_quantity: string;
      placement_hint: string;
      marginal_gain: number;
      faults_improved: string[];
    }>;
  };
  errors?: Array<{ code: string; message: string }>;
  warnings?: Array<{ code: string; message: string }>;
};

export async function analyzeAssembly(
  plantAssembly: PlantAssembly,
  signal?: AbortSignal,
): Promise<AnalysisResult> {
  const options: { method: "POST"; body: { plant_assembly: PlantAssembly }; signal?: AbortSignal } = {
    method: "POST",
    body: { plant_assembly: plantAssembly },
  };
  if (signal) options.signal = signal;
  return apiFetch<AnalysisResult>("/api/library/analyze-assembly", options);
}