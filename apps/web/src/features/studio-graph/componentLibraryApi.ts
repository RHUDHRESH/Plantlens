import { apiFetch } from "../../api/client";
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