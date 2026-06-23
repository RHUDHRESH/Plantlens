import { apiFetch } from "../../api/client";
import { ApiError } from "../../api/types";
import type {
  Binding,
  ConnectionFormState,
  ConnectionStatus,
  EndpointError,
  ModelBundleLite,
  ScanRequest,
  ScanRow,
  TestReadResult,
} from "./types";

export class ConnectionApiError extends Error {
  readonly endpoint: string;
  readonly status?: number | undefined;

  constructor(endpoint: string, message: string, status?: number) {
    super(message);
    this.name = "ConnectionApiError";
    this.endpoint = endpoint;
    if (status !== undefined) this.status = status;
  }

  toEndpointError(): EndpointError {
    const err: EndpointError = { endpoint: this.endpoint, message: this.message };
    if (this.status !== undefined) err.status = this.status;
    return err;
  }
}

function wrapApiError(endpoint: string, err: unknown): never {
  if (err instanceof ConnectionApiError) throw err;
  if (err instanceof ApiError) {
    throw new ConnectionApiError(endpoint, err.body.message ?? err.message, err.status);
  }
  if (err instanceof Error) {
    throw new ConnectionApiError(endpoint, err.message);
  }
  throw new ConnectionApiError(endpoint, "Request failed");
}

async function connectionFetch<T>(
  endpoint: string,
  path: string,
  options: { method?: "GET" | "POST"; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  try {
    return await apiFetch<T>(path, options);
  } catch (err) {
    wrapApiError(endpoint, err);
  }
}

function regPrefix(regType: "input" | "holding"): string {
  return regType === "holding" ? "hreg" : "ireg";
}

function normalizeScanRow(
  row: Record<string, unknown>,
  request: ScanRequest,
  slaveId = 1,
): ScanRow {
  const register =
    typeof row.register === "number"
      ? row.register
      : typeof row.address === "number"
        ? row.address
        : 0;

  const regType = (row.regType ?? row.reg_type ?? request.regType) as ScanRow["regType"];
  const dataType = (row.dataType ?? row.data_type ?? request.dataType) as ScanRow["dataType"];
  const wordOrder = (row.wordOrder ?? row.word_order ?? request.wordOrder) as ScanRow["wordOrder"];

  const channelRef =
    typeof row.channelRef === "string"
      ? row.channelRef
      : typeof row.channel_ref === "string"
        ? row.channel_ref
        : `modbus:slave${slaveId}:${regPrefix(regType)}:${register}`;

  let raw: number | string | null = null;
  if (row.raw !== undefined && row.raw !== null) {
    raw = row.raw as number | string;
  } else if (Array.isArray(row.registers)) {
    raw = row.registers.map(String).join(",");
  }

  const decoded =
    row.decoded !== undefined && row.decoded !== null
      ? (row.decoded as number)
      : row.decoded_float !== undefined && row.decoded_float !== null
        ? (row.decoded_float as number)
        : null;

  const responding =
    typeof row.responding === "boolean"
      ? row.responding
      : decoded !== null && decoded !== undefined;

  const quality = (row.quality as ScanRow["quality"]) ?? (responding ? "GOOD" : "BAD");

  return {
    channelRef,
    register,
    regType,
    dataType,
    wordOrder,
    raw,
    decoded,
    responding,
    suggestedTag:
      (row.suggestedTag as string | null) ??
      (row.suggested_tag as string | null) ??
      null,
    boundTag: (row.boundTag as string | null) ?? (row.bound_tag as string | null) ?? null,
    equipment: (row.equipment as string | null) ?? null,
    quality,
  };
}

function normalizeScanRows(data: unknown, request: ScanRequest): ScanRow[] {
  if (Array.isArray(data)) {
    return data.map((row) => normalizeScanRow(row as Record<string, unknown>, request));
  }
  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    const rows = obj.rows ?? obj.scan_results ?? obj.scanResults;
    if (Array.isArray(rows)) {
      return rows.map((row) => normalizeScanRow(row as Record<string, unknown>, request));
    }
  }
  return [];
}

export async function listPorts(signal?: AbortSignal): Promise<string[]> {
  const endpoint = "GET /api/ports";
  const data = await connectionFetch<unknown>(
    endpoint,
    "/api/ports",
    signal ? { signal } : {},
  );
  if (Array.isArray(data)) {
    return data.map(String);
  }
  if (typeof data === "object" && data !== null && Array.isArray((data as { ports?: unknown }).ports)) {
    return ((data as { ports: unknown[] }).ports).map((p) => {
      if (typeof p === "string") return p;
      if (typeof p === "object" && p !== null && "device" in p) {
        return String((p as { device: string }).device);
      }
      return String(p);
    });
  }
  return [];
}

export async function getConnectionStatus(signal?: AbortSignal): Promise<ConnectionStatus> {
  const endpoint = "GET /api/connection/status";
  const data = await connectionFetch<Record<string, unknown>>(
    endpoint,
    "/api/connection/status",
    signal ? { signal } : {},
  );
  return {
    connected: Boolean(data.connected),
    port: (data.port as string | null) ?? null,
    slaveId:
      typeof data.slaveId === "number"
        ? data.slaveId
        : typeof data.slave_id === "number"
          ? data.slave_id
          : null,
    pollHz:
      typeof data.pollHz === "number"
        ? data.pollHz
        : typeof data.poll_hz === "number"
          ? data.poll_hz
          : null,
    lastPollTs: (data.lastPollTs ?? data.last_poll_ts ?? null) as number | string | null,
    okCount:
      typeof data.okCount === "number"
        ? data.okCount
        : typeof data.ok_count === "number"
          ? data.ok_count
          : 0,
    errorCount:
      typeof data.errorCount === "number"
        ? data.errorCount
        : typeof data.error_count === "number"
          ? data.error_count
          : 0,
    lastError: (data.lastError ?? data.last_error ?? null) as string | null,
  };
}

export async function connectModbus(form: ConnectionFormState): Promise<unknown> {
  const endpoint = "POST /api/connection";
  return connectionFetch(endpoint, "/api/connection", {
    method: "POST",
    body: {
      port: form.port,
      baudrate: form.baudrate,
      parity: form.parity,
      stopbits: form.stopbits,
      bytesize: form.bytesize,
      slaveId: form.slaveId,
      slave_id: form.slaveId,
      pollHz: form.pollHz,
      poll_hz: form.pollHz,
    },
  });
}

export async function disconnectModbus(): Promise<unknown> {
  const endpoint = "POST /api/connection/disconnect";
  return connectionFetch(endpoint, "/api/connection/disconnect", { method: "POST" });
}

export async function scanRegisters(request: ScanRequest): Promise<ScanRow[]> {
  const endpoint = "POST /api/scan";
  const data = await connectionFetch<unknown>(endpoint, "/api/scan", {
    method: "POST",
    body: {
      startReg: request.startReg,
      start_reg: request.startReg,
      count: request.count,
      regType: request.regType,
      reg_type: request.regType,
      dataType: request.dataType,
      data_type: request.dataType,
      wordOrder: request.wordOrder,
      word_order: request.wordOrder,
    },
  });
  return normalizeScanRows(data, request);
}

export async function testRead(channelRef: string): Promise<TestReadResult> {
  const endpoint = "POST /api/test";
  const data = await connectionFetch<Record<string, unknown>>(endpoint, "/api/test", {
    method: "POST",
    body: { channelRef, channel_ref: channelRef },
  });
  const result: TestReadResult = {
    ok: Boolean(data.ok ?? data.success ?? false),
    value: typeof data.value === "number" ? data.value : null,
    latencyMs:
      typeof data.latencyMs === "number"
        ? data.latencyMs
        : typeof data.latency_ms === "number"
          ? data.latency_ms
          : null,
  };
  const error = (data.error as string | undefined) ?? (data.message as string | undefined);
  if (error) result.error = error;
  return result;
}

export async function getModelBundle(signal?: AbortSignal): Promise<ModelBundleLite> {
  const endpoint = "GET /api/model";
  return connectionFetch<ModelBundleLite>(endpoint, "/api/model", signal ? { signal } : {});
}

export async function commitBindings(
  bindings: Binding[],
): Promise<{ status: string; audit_entry?: unknown; audit_id?: string }> {
  const endpoint = "POST /api/bindings";
  return connectionFetch(endpoint, "/api/bindings", {
    method: "POST",
    body: { bindings },
  });
}

export function extractTagIds(model: ModelBundleLite | undefined): string[] {
  if (!model?.tags || !Array.isArray(model.tags)) return [];
  const ids: string[] = [];
  for (const tag of model.tags) {
    const id =
      (tag.tag_id as string | undefined) ??
      (tag.tag as string | undefined) ??
      (tag.id as string | undefined) ??
      (tag.name as string | undefined);
    if (id) ids.push(id);
  }
  return ids;
}