import { apiFetch } from "../../api/client";
import type { CompatibilityResult, PlantAssembly } from "../../app/schemas/plantAssembly";
import type { ComponentDetailResponse, ComponentLibraryResponse } from "./componentLibraryTypes";

export function fetchComponentLibrary(signal?: AbortSignal): Promise<ComponentLibraryResponse> {
  return apiFetch<ComponentLibraryResponse>("/api/library/components", signal ? { signal } : {});
}

export function fetchComponent(
  componentTypeId: string,
  signal?: AbortSignal,
): Promise<ComponentDetailResponse> {
  return apiFetch<ComponentDetailResponse>(
    `/api/library/components/${encodeURIComponent(componentTypeId)}`,
    signal ? { signal } : {},
  );
}

export function checkConnection(body: {
  from_component_type_id: string;
  from_port_id: string;
  to_component_type_id: string;
  to_port_id: string;
}): Promise<CompatibilityResult & { status: string }> {
  return apiFetch("/api/library/check-connection", { method: "POST", body });
}

export function validateAssembly(plantAssembly: PlantAssembly): Promise<{
  status: "ok" | "error";
  errors: Array<{ code: string; message: string; path: string; fix: string }>;
  warnings: Array<{ code: string; message: string; path: string; fix: string }>;
}> {
  return apiFetch("/api/library/validate-assembly", {
    method: "POST",
    body: { plant_assembly: plantAssembly },
  });
}