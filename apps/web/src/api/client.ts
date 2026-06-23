/**
 * Typed REST client — no diagnosis logic; surfaces structured {code,message,fix} errors.
 */
import { getApiBaseUrl, getAuthToken } from "./config";
import type {
  ApiErrorBody,
  CompiledBundle,
  GatewayConnectionStatus,
  GatewayPortProbeResponse,
  GatewayPortsResponse,
  GatewayStatus,
  RuntimeSnapshot,
} from "./types";
import { ApiError } from "./types";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  signal?: AbortSignal;
}

async function parseErrorBody(response: Response): Promise<ApiErrorBody> {
  try {
    const data = await response.json();
    if (typeof data === "object" && data !== null) {
      const detail = (data as { detail?: unknown }).detail;
      if (typeof detail === "object" && detail !== null && "message" in detail) {
        return detail as ApiErrorBody;
      }
      if (typeof detail === "string") {
        return { message: detail };
      }
      if ("message" in data) {
        return data as ApiErrorBody;
      }
    }
  } catch {
    /* fall through */
  }
  return {
    message: `Request failed (${response.status})`,
    fix: "Check API availability and authentication.",
  };
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const base = getApiBaseUrl();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const init: RequestInit = { method: options.method ?? "GET", headers };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);
  if (options.signal) init.signal = options.signal;

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ApiError(0, {
      code: "network_error",
      message: "API unreachable",
      fix: "Start the API server or check VITE_API_BASE_URL.",
    });
  }

  if (!response.ok) {
    const body = await parseErrorBody(response);
    throw new ApiError(response.status, body);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function issueDevToken(role = "operator"): Promise<string> {
  const result = await apiFetch<{ access_token: string }>("/internal/auth-test/dev-token", {
    method: "POST",
    body: { role, subject: "web-operator" },
  });
  return result.access_token;
}

export function getCompiledBundle(signal?: AbortSignal): Promise<CompiledBundle> {
  return apiFetch<CompiledBundle>("/api/hmi/compiled", signal ? { signal } : {});
}

export function getRuntimeSnapshot(signal?: AbortSignal): Promise<RuntimeSnapshot> {
  return apiFetch<RuntimeSnapshot>("/api/runtime/snapshot", signal ? { signal } : {});
}

export function getGatewayStatus(signal?: AbortSignal): Promise<GatewayStatus> {
  return apiFetch<GatewayStatus>("/api/gateway/status", signal ? { signal } : {});
}

export function getGatewayPorts(signal?: AbortSignal): Promise<GatewayPortsResponse> {
  return apiFetch<GatewayPortsResponse>("/api/gateway/ports", signal ? { signal } : {});
}

export function probeGatewayPort(
  port: string,
  baudrate = 9600,
  signal?: AbortSignal,
): Promise<GatewayPortProbeResponse> {
  const params = new URLSearchParams({ port, baudrate: String(baudrate) });
  return apiFetch<GatewayPortProbeResponse>(`/api/gateway/probe?${params}`, signal ? { signal } : {});
}

export function getGatewayConnectionStatus(signal?: AbortSignal): Promise<GatewayConnectionStatus> {
  return apiFetch<GatewayConnectionStatus>(
    "/api/gateway/connection/status",
    signal ? { signal } : {},
  );
}

export function ackAlarm(alarmId: string): Promise<{ status: string; alarm_id: string; audit_id: string }> {
  return apiFetch(`/api/runtime/alarms/${encodeURIComponent(alarmId)}/ack`, { method: "POST" });
}

export interface CompileResult {
  status: "ok" | "error";
  compiled?: CompiledBundle;
  errors?: Array<{ code?: string; message: string; fix?: string; path?: string }>;
  warnings?: Array<{ code?: string; message: string; fix?: string }>;
  previous_hash?: string | null;
}

export function compileProject(): Promise<CompileResult> {
  return apiFetch<CompileResult>("/api/compiler/compile", { method: "POST" });
}

export function getAuthoredBundle(signal?: AbortSignal): Promise<Record<string, unknown>> {
  return apiFetch("/api/compiler/authored", signal ? { signal } : {});
}

export function compileBundle(bundle: Record<string, unknown>): Promise<CompileResult> {
  return apiFetch<CompileResult>("/api/compiler/compile-bundle", {
    method: "POST",
    body: bundle,
  });
}

export interface ScenarioSummary {
  id: string;
  name: string;
  description?: string;
  duration_ms?: number;
  expected_situation?: string | null;
  expected_root_cause?: string | null;
}

export function getScenarios(signal?: AbortSignal): Promise<{
  scenarios: ScenarioSummary[];
  running_scenario_id: string | null;
}> {
  return apiFetch("/api/scenarios", signal ? { signal } : {});
}

export function startScenario(scenarioId: string): Promise<{ status: string; scenario_id: string }> {
  return apiFetch(`/api/scenarios/${encodeURIComponent(scenarioId)}/start`, { method: "POST" });
}

export function stopScenario(): Promise<{ status: string }> {
  return apiFetch("/api/scenarios/stop", { method: "POST" });
}

export interface IncidentRoom {
  incident_id: string;
  title: string;
  status: string;
  severity: string;
  root_asset: { asset_id: string; name: string; status: string };
  live_state?: {
    still_active: boolean;
    active_alarm_count: number;
    latest_value_summary: Array<{ tag_id: string; value: unknown; unit: string; quality: string }>;
  };
  calm_card?: Record<string, unknown>;
  evidence_bundle?: { situation?: Record<string, unknown>; raw_alarms?: unknown[] };
  checklist: Array<{ id: string; label: string; status: string }>;
  timeline: Array<{ id: string; type: string; timestamp: string; actor: string; message: string }>;
}

export function escalateIncident(body: {
  calm_card: Record<string, unknown>;
  situation: Record<string, unknown>;
  raw_alarms: unknown[];
}): Promise<{ incident: IncidentRoom; audit_id: string }> {
  return apiFetch("/api/incidents/escalate", { method: "POST", body });
}

export function getIncidentRoom(incidentId: string, signal?: AbortSignal): Promise<IncidentRoom> {
  return apiFetch(`/api/incidents/${encodeURIComponent(incidentId)}`, signal ? { signal } : {});
}

export function addIncidentComment(
  incidentId: string,
  message: string,
): Promise<{ incident: IncidentRoom; audit_id: string }> {
  return apiFetch(`/api/incidents/${encodeURIComponent(incidentId)}/comments`, {
    method: "POST",
    body: { message },
  });
}

export function updateIncidentStatus(
  incidentId: string,
  status: string,
): Promise<{ incident: IncidentRoom; audit_id: string }> {
  return apiFetch(`/api/incidents/${encodeURIComponent(incidentId)}/status`, {
    method: "POST",
    body: { status },
  });
}

export function completeChecklistItem(
  incidentId: string,
  itemId: string,
): Promise<{ incident: IncidentRoom; audit_id: string }> {
  return apiFetch(`/api/incidents/${encodeURIComponent(incidentId)}/checklist`, {
    method: "POST",
    body: { item_id: itemId, status: "done" },
  });
}

export interface AgentDraft {
  draft_id: string;
  draft_type: string;
  status: string;
  proposed_by: string;
  payload: Record<string, unknown>;
}

export function requestGraphDraft(prompt: string): Promise<{ draft: AgentDraft }> {
  return apiFetch("/api/agents/graph-draft", {
    method: "POST",
    body: { prompt },
  });
}

export function listPendingDrafts(signal?: AbortSignal): Promise<{ drafts: AgentDraft[] }> {
  return apiFetch("/api/agents/drafts/pending", signal ? { signal } : {});
}

export function approveAgentDraft(draftId: string): Promise<{ draft: AgentDraft; audit_id: string }> {
  return apiFetch("/api/agents/drafts/approve", {
    method: "POST",
    body: { draft_id: draftId },
  });
}

export function rejectAgentDraft(draftId: string): Promise<{ draft: AgentDraft; audit_id: string }> {
  return apiFetch("/api/agents/drafts/reject", {
    method: "POST",
    body: { draft_id: draftId },
  });
}

export function getPlcStatus(signal?: AbortSignal): Promise<Record<string, unknown>> {
  return apiFetch("/api/plc/status", signal ? { signal } : {});
}

export function getComponentLibrary(signal?: AbortSignal): Promise<Record<string, unknown>> {
  return apiFetch("/api/library/components", signal ? { signal } : {});
}
