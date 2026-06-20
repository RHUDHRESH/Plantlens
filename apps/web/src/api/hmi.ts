/**
 * HMI projection API — no diagnosis; surfaces backend PlantHMIState only.
 */
import { apiFetch } from "./client";
import { ApiError } from "./types";
import type { HmiPreviewInput, PlantHMIState } from "../app/schemas/plantHmi";

export function postHmiPreview(input: HmiPreviewInput): Promise<PlantHMIState> {
  return apiFetch<PlantHMIState>("/api/hmi/preview", {
    method: "POST",
    body: input,
  });
}

export function getRuntimeHmiState(signal?: AbortSignal): Promise<PlantHMIState> {
  return apiFetch<PlantHMIState>("/api/hmi/runtime", signal ? { signal } : {});
}

/** True when runtime endpoint is missing or unreachable — never triggers demo fallback. */
export function isRuntimeEndpointUnavailable(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 404 || error.status === 0;
  }
  if (error instanceof TypeError) {
    return true;
  }
  return false;
}