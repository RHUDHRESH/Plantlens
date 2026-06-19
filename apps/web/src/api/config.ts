const DEFAULT_API_BASE = "";

/** REST base URL — empty string uses same origin (Vite proxy in dev). */
export function getApiBaseUrl(): string {
  const env = import.meta.env.VITE_API_BASE_URL;
  return typeof env === "string" && env.length > 0 ? env.replace(/\/$/, "") : DEFAULT_API_BASE;
}

export function getWsRuntimeUrl(): string {
  const env = import.meta.env.VITE_WS_RUNTIME_URL;
  if (typeof env === "string" && env.length > 0) return env;
  const base = getApiBaseUrl();
  if (base) {
    const url = new URL(base);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/api/ws/runtime";
    url.search = "";
    url.hash = "";
    return url.toString();
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/ws/runtime`;
}

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}