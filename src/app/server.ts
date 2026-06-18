import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import {
  createFileStores,
  runCliffordsCycle,
  writeCompiledModelArtifacts,
  type CliffordInput,
  type CliffordRunResult
} from "../cliffords/index.js";
import {
  demoArchetypeLibrary,
  demoCliffordConfig,
  demoCompiledModel,
  demoEquipmentRegistry,
  demoTagRegistry,
  demoZoneRegistry
} from "./demoPlant.js";

const PORT = Number(process.env.PORT ?? 4177);
const HOST = process.env.HOST ?? "127.0.0.1";
const STATIC_ROOT = resolve(process.cwd(), "src", "app", "public");
const MAX_BODY_BYTES = 38 * 1024 * 1024;
const PREVIEW_LIMIT = 200;
const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}(?:==)?|[A-Za-z0-9+/]{3}=?)?$/;

export class HttpError extends Error {
  public constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

type FilePayload = {
  kind: "file";
  filename: string;
  bytes_base64: string;
  mime_type?: string;
};

type TextPayload = {
  kind: "paste";
  text: string;
};

type JsonPayload = {
  kind: "json" | "event";
  payload: unknown;
};

type IntakeRequest = {
  input: FilePayload | TextPayload | JsonPayload;
  plant_timezone?: string;
};

type ApiResponse = {
  result: Omit<
    CliffordRunResult,
    | "parsed_records"
    | "clean_records"
    | "quarantined_records"
    | "mapping_requests"
  > & {
    parsed_records: unknown[];
    clean_records: unknown[];
    quarantined_records: unknown[];
    mapping_requests: unknown[];
  };
  preview_limit: number;
  output_paths: Record<string, string>;
};

const mimeTypes = new Map<string, string>([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"]
]);

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown
): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let body = "";
    let size = 0;
    let rejected = false;
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      if (rejected) {
        return;
      }
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_BYTES) {
        rejected = true;
        reject(new HttpError(413, "Request body is too large"));
        request.destroy();
        return;
      }
      body += chunk;
    });
    request.on("end", () => {
      if (!rejected) {
        resolveBody(body);
      }
    });
    request.on("error", (error) => {
      if (!rejected) {
        reject(error);
      }
    });
  });
}

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "Expected a JSON object");
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function intakeRequest(
  input: IntakeRequest["input"],
  plantTimezone: unknown
): IntakeRequest {
  const timezone = optionalString(plantTimezone);
  return timezone ? { input, plant_timezone: timezone } : { input };
}

export function parseIntakeRequest(value: unknown): IntakeRequest {
  assertRecord(value);
  const input = value.input;
  assertRecord(input);
  const kind = input.kind;

  if (kind === "file") {
    const filename = optionalString(input.filename);
    const bytesBase64 = optionalString(input.bytes_base64);
    if (!filename || !bytesBase64) {
      throw new HttpError(400, "File input requires filename and bytes_base64");
    }
    const filePayload: FilePayload = {
      kind,
      filename,
      bytes_base64: bytesBase64
    };
    const mimeType = optionalString(input.mime_type);
    if (mimeType) {
      filePayload.mime_type = mimeType;
    }
    return intakeRequest(filePayload, value.plant_timezone);
  }

  if (kind === "paste") {
    const text = optionalString(input.text);
    if (!text) {
      throw new HttpError(400, "Text input requires text");
    }
    return intakeRequest({ kind, text }, value.plant_timezone);
  }

  if (kind === "json" || kind === "event") {
    if (!("payload" in input)) {
      throw new HttpError(400, `${kind} input requires payload`);
    }
    return intakeRequest({ kind, payload: input.payload }, value.plant_timezone);
  }

  throw new HttpError(400, "Unsupported input kind");
}

function decodeBase64(value: string): Buffer {
  const compact = value.replace(/\s+/g, "");
  if (!compact || !BASE64_PATTERN.test(compact)) {
    throw new HttpError(400, "bytes_base64 must be valid base64");
  }
  return Buffer.from(compact, "base64");
}

export function toCliffordInput(payload: IntakeRequest["input"]): CliffordInput {
  if (payload.kind === "file") {
    const bytes = decodeBase64(payload.bytes_base64);
    if (payload.mime_type) {
      return {
        kind: "file",
        filename: payload.filename,
        bytes,
        mime_type: payload.mime_type
      };
    }
    return {
      kind: "file",
      filename: payload.filename,
      bytes
    };
  }
  if (payload.kind === "paste") {
    return payload;
  }
  return payload;
}

function outputPaths(runId: string): Record<string, string> {
  const base = join(demoCliffordConfig.data_directory ?? ".cliffords-data", "runs", runId);
  return {
    raw: join(demoCliffordConfig.data_directory ?? ".cliffords-data", "raw", "<sha256>"),
    audit: join(demoCliffordConfig.data_directory ?? ".cliffords-data", "audit", "events.jsonl"),
    artifact: join(base, "artifact.json"),
    parsed: join(base, "parsed.json"),
    canonical: join(base, "canonical.json"),
    quarantine: join(base, "quarantine.json"),
    mapping_requests: join(base, "mapping-requests.json"),
    report: join(base, "report.json")
  };
}

function summarizeResult(result: CliffordRunResult): ApiResponse {
  return {
    result: {
      ...result,
      parsed_records: result.parsed_records.slice(0, PREVIEW_LIMIT),
      clean_records: result.clean_records.slice(0, PREVIEW_LIMIT),
      quarantined_records: result.quarantined_records.slice(0, PREVIEW_LIMIT),
      mapping_requests: result.mapping_requests.slice(0, PREVIEW_LIMIT)
    },
    preview_limit: PREVIEW_LIMIT,
    output_paths: outputPaths(result.run_id)
  };
}

async function handleRun(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const contentLength = Number(request.headers["content-length"]);
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_BODY_BYTES
  ) {
    throw new HttpError(413, "Request body is too large");
  }
  const body = await readBody(request);
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(body) as unknown;
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
  const payload = parseIntakeRequest(parsedBody);
  const input = toCliffordInput(payload.input);
  const stores = createFileStores(
    demoCliffordConfig.data_directory ?? ".cliffords-data"
  );
  const result = await runCliffordsCycle(input, {
    plant_timezone: payload.plant_timezone ?? "Asia/Kolkata",
    tag_registry: demoTagRegistry,
    equipment_registry: demoEquipmentRegistry,
    zone_registry: demoZoneRegistry,
    archetype_library: demoArchetypeLibrary,
    config: demoCliffordConfig,
    stores
  });
  sendJson(response, 200, summarizeResult(result));
}

function safeStaticPath(pathname: string): string {
  const requested = pathname === "/" ? "/index.html" : pathname;
  let decoded: string;
  try {
    decoded = decodeURIComponent(requested);
  } catch {
    throw new HttpError(400, "Invalid static path");
  }
  const fullPath = resolve(STATIC_ROOT, `.${decoded}`);
  const staticRelativePath = relative(STATIC_ROOT, fullPath);
  if (
    staticRelativePath.startsWith("..") ||
    isAbsolute(staticRelativePath)
  ) {
    throw new HttpError(400, "Invalid static path");
  }
  return fullPath;
}

async function serveStatic(
  requestUrl: URL,
  response: ServerResponse
): Promise<void> {
  const path = safeStaticPath(requestUrl.pathname);
  const file = await stat(path)
    .then((entry) => (entry.isFile() ? path : join(STATIC_ROOT, "index.html")))
    .catch(() => join(STATIC_ROOT, "index.html"));
  const content = await readFile(file);
  response.writeHead(200, {
    "content-type":
      mimeTypes.get(extname(file).toLowerCase()) ??
      "application/octet-stream",
    "cache-control": "no-cache"
  });
  response.end(content);
}

const server = createServer((request, response) => {
  void (async () => {
    const requestUrl = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);
    if (requestUrl.pathname === "/api/health") {
      if (request.method !== "GET") {
        sendJson(response, 405, { error: "Method not allowed" });
        return;
      }
      sendJson(response, 200, {
        ok: true,
        service: "cliffords-intake",
        data_directory: demoCliffordConfig.data_directory
      });
      return;
    }
    if (requestUrl.pathname === "/api/run") {
      if (request.method !== "POST") {
        sendJson(response, 405, { error: "Method not allowed" });
        return;
      }
      if (!request.headers["content-type"]?.includes("application/json")) {
        sendJson(response, 415, { error: "Expected application/json" });
        return;
      }
      await handleRun(request, response);
      return;
    }
    if (requestUrl.pathname.startsWith("/api/")) {
      sendJson(response, 404, { error: "API route not found" });
      return;
    }
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }
    await serveStatic(requestUrl, response);
  })().catch((error: unknown) => {
    if (response.headersSent) {
      response.end();
      return;
    }
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    sendJson(response, statusCode, {
      error:
        error instanceof HttpError
          ? error.message
          : "Request failed"
    });
  });
});

export async function startServer(): Promise<void> {
  await writeCompiledModelArtifacts(
    demoCompiledModel,
    demoCliffordConfig.data_directory ?? ".cliffords-data"
  );
  server.listen(PORT, HOST, () => {
    console.log(`Cliffords Intake UI running at http://${HOST}:${PORT}`);
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  void startServer().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Server failed");
    process.exitCode = 1;
  });
}
