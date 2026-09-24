import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderAt, setRole } from "../approvals/testUtils";
import type { GatewayEntry, GatewaysResponse } from "./api";
import { ConnectionsPage } from "./ConnectionsPage";
import {
  adapterFamily,
  formatAge,
  linkStatus,
  needsAttention,
  serverUrl,
  setupCommands,
  summarize,
  vidPid,
} from "./gatewayModel";

const state: { data: GatewaysResponse | undefined; error: unknown; isLoading: boolean } = {
  data: undefined,
  error: null,
  isLoading: false,
};

vi.mock("./api", () => ({ useGateways: () => state }));

const CHECKED = "2026-09-24T10:00:00Z";

function windowsGw(overrides: Partial<GatewayEntry> = {}): GatewayEntry {
  return {
    gateway_id: "gw-bench-1",
    status: "online",
    heartbeat_age_s: 2.1,
    received_at: "2026-09-24T09:59:58Z",
    first_seen_at: "2026-09-24T08:00:00Z",
    remote_addr: "192.168.1.20",
    heartbeat: {
      gateway_id: "gw-bench-1",
      hostname: "BENCH-PC-01",
      os: "Windows 11",
      version: "0.1.0",
      mode: "modbus",
      links: [
        {
          name: "rtu:bus1",
          state: "connected",
          device: "COM5",
          selector: "auto",
          vid: "1A86",
          pid: "7523",
          serial_number: null,
          description: "USB-SERIAL CH340 (COM5)",
          reconnect_count: 1,
          last_error: null,
        },
      ],
      counters: { frames_published: 12000, frames_per_s: 8, stale_tags: 0, modbus_requests: 3000, modbus_timeouts: 2, modbus_crc_errors: 0 },
      uplink: { queue_depth: 0, dropped: 0, quarantined: 0, last_status: 200 },
      started_at: "2026-09-24T08:00:00Z",
      health_port: 9101,
      ips: ["192.168.1.20"],
    },
    last_frame_at: "2026-09-24T09:59:59Z",
    tag_count: 1,
    assets: ["BUS-101"],
    tags: [
      { tag_id: "BUS_101_V", asset_id: "BUS-101", value: 48.25, unit: "V", quality: "GOOD", source: "modbus_rtu", received_at: "2026-09-24T09:59:59Z" },
    ],
    ...overrides,
  };
}

function linuxOfflineGw(): GatewayEntry {
  const base = windowsGw();
  return {
    ...base,
    gateway_id: "gw-line-1",
    status: "offline",
    heartbeat_age_s: 300,
    heartbeat: {
      ...base.heartbeat!,
      gateway_id: "gw-line-1",
      hostname: "lab-pi",
      os: "Linux 6.8",
      mode: "line",
      links: [
        {
          state: "backoff",
          device: "/dev/ttyACM0",
          selector: "2341:0043",
          vid: "2341",
          pid: "0043",
          serial_number: "95032303",
          description: "Arduino Uno",
          reconnect_count: 4,
          last_error: "device disappeared",
        },
      ],
      counters: { frames_published: 50, frames_per_s: 0, stale_tags: 2, line_accepted: 40, line_rejected: 1, line_checksum_failures: 1 },
    },
    tags: [{ tag_id: "VIB_X", asset_id: "VIB-301", value: 1.5, unit: "mm/s", quality: "STALE", source: "serial_line", received_at: "2026-09-24T09:55:00Z" }],
  };
}

beforeEach(() => {
  setRole("viewer");
  state.data = undefined;
  state.error = null;
  state.isLoading = false;
});

describe("gateway model", () => {
  it("maps VID:PID to adapter families", () => {
    expect(adapterFamily("1A86", "7523")).toBe("CH340");
    expect(adapterFamily("0403", "6001")).toBe("FTDI FT232R");
    expect(adapterFamily("10c4", "ea60")).toBe("CP210x");
    expect(adapterFamily("2341", "0043")).toBe("Arduino Uno R3");
    expect(adapterFamily("2341", "9999")).toBe("Arduino");
    expect(adapterFamily("0403", "ffff")).toBe("FTDI");
    expect(adapterFamily("dead", "beef")).toBeNull();
    expect(adapterFamily(null, null)).toBeNull();
    expect(vidPid({ vid: "1a86", pid: "7523" })).toBe("1A86:7523");
    expect(vidPid({ vid: null, pid: "7523" })).toBeNull();
  });

  it("maps link states to shape-coded badges", () => {
    expect(linkStatus("connected")).toEqual({ kind: "normal", label: "Connected" });
    expect(linkStatus("backoff").kind).toBe("high");
    expect(linkStatus("stopped").kind).toBe("offline");
  });

  it("summarizes and flags attention", () => {
    const list = [windowsGw(), linuxOfflineGw()];
    expect(summarize(list)).toEqual({ online: 1, stale: 0, offline: 1, unknown: 0 });
    expect(needsAttention(windowsGw())).toBe(false);
    expect(needsAttention(linuxOfflineGw())).toBe(true);
  });

  it("formats ages and setup commands", () => {
    expect(formatAge(null)).toBe("never");
    expect(formatAge(1)).toBe("just now");
    expect(formatAge(42)).toBe("42 s ago");
    expect(formatAge(600)).toBe("10 min ago");
    expect(serverUrl({ protocol: "http:", hostname: "192.168.1.10" })).toBe("http://192.168.1.10:8000");
    expect(serverUrl({ protocol: "http:", hostname: "x" }, "http://api.local:9000/")).toBe("http://api.local:9000");
    const cmds = setupCommands("http://10.0.0.5:8000");
    expect(cmds.windows).toContain("-Server http://10.0.0.5:8000");
    expect(cmds.windows).toContain("-Token '");
    expect(cmds.windows).toContain("start-gateway.ps1");
    expect(cmds.unix).toContain("-- --server http://10.0.0.5:8000");
    expect(cmds.unix).toContain("start-gateway.sh");
  });
});

describe("ConnectionsPage", () => {
  it("shows setup steps when no gateway is connected", () => {
    state.data = { checked_at: CHECKED, online_within_s: 15, stale_within_s: 60, gateways: [] };
    renderAt(<ConnectionsPage />);
    expect(screen.getByText("No gateway PCs connected")).toBeInTheDocument();
    expect(screen.getByLabelText("Windows PowerShell command").textContent).toContain("start-gateway.ps1");
    expect(screen.getByLabelText("Linux / macOS command").textContent).toContain("start-gateway.sh");
    expect(screen.getAllByText(/:8000$/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Copy server address" })).toBeInTheDocument();
  });

  it("renders an online Windows gateway with port, adapter and tags", () => {
    state.data = { checked_at: CHECKED, online_within_s: 15, stale_within_s: 60, gateways: [windowsGw()] };
    renderAt(<ConnectionsPage />);
    const card = screen.getByRole("region", { name: "BENCH-PC-01" });
    const c = within(card);
    expect(c.getByText("Online")).toBeInTheDocument();
    expect(c.getByText("COM5")).toBeInTheDocument();
    expect(c.getByText("CH340")).toBeInTheDocument();
    expect(c.getByText("1A86:7523")).toBeInTheDocument();
    expect(c.getByText("Connected")).toBeInTheDocument();
    expect(c.getByText("Windows 11")).toBeInTheDocument();
    expect(c.getByText("192.168.1.20")).toBeInTheDocument();
    expect(c.getByText("Modbus RTU")).toBeInTheDocument();
    expect(c.getByText("BUS_101_V")).toBeInTheDocument();
    expect(c.getByText("48.25")).toBeInTheDocument();
    expect(c.getByText("12,000")).toBeInTheDocument();
    expect(screen.queryByText("No gateway PCs connected")).not.toBeInTheDocument();
  });

  it("renders an offline Linux Arduino gateway with its error and stale tags", () => {
    state.data = { checked_at: CHECKED, online_within_s: 15, stale_within_s: 60, gateways: [windowsGw(), linuxOfflineGw()] };
    renderAt(<ConnectionsPage />);
    const card = screen.getByRole("region", { name: "lab-pi" });
    const c = within(card);
    expect(c.getByText("Offline")).toBeInTheDocument();
    expect(c.getByText("/dev/ttyACM0")).toBeInTheDocument();
    expect(c.getByText("Arduino Uno R3")).toBeInTheDocument();
    expect(c.getByText("Disconnected, retrying")).toBeInTheDocument();
    expect(c.getByText("device disappeared")).toBeInTheDocument();
    expect(c.getByText("Arduino line (PL1)")).toBeInTheDocument();
    expect(c.getByText("Lines accepted")).toBeInTheDocument();
    expect(c.getByText("Stale")).toBeInTheDocument();
    expect(card.className).toContain("is-attention");
    expect(screen.getByText("offline", { exact: false, selector: ".pl-chip" })).toBeInTheDocument();
  });

  it("toggles the connect-another-PC instructions from the keyboard-reachable button", () => {
    state.data = { checked_at: CHECKED, online_within_s: 15, stale_within_s: 60, gateways: [windowsGw()] };
    renderAt(<ConnectionsPage />);
    const button = screen.getByRole("button", { name: "Connect another PC" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Linux / macOS command")).toBeInTheDocument();
  });

  it("is visible to every role (no role-gated actions)", () => {
    for (const role of ["viewer", "operator", "engineer"] as const) {
      setRole(role);
      state.data = { checked_at: CHECKED, online_within_s: 15, stale_within_s: 60, gateways: [windowsGw()] };
      const { unmount } = renderAt(<ConnectionsPage />);
      expect(screen.getByRole("region", { name: "BENCH-PC-01" })).toBeInTheDocument();
      unmount();
    }
  });

  it("shows API errors with their fix", () => {
    state.error = Object.assign(new Error("API unreachable"), { body: { message: "API unreachable", fix: "Start the API server." } });
    renderAt(<ConnectionsPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("Start the API server.");
  });

  it("shows a gateway that sends data without heartbeat", () => {
    state.data = {
      checked_at: CHECKED,
      online_within_s: 15,
      stale_within_s: 60,
      gateways: [windowsGw({ gateway_id: "gw-old", status: "unknown", heartbeat: null, heartbeat_age_s: null })],
    };
    renderAt(<ConnectionsPage />);
    const card = screen.getByRole("region", { name: "gw-old" });
    expect(within(card).getByText("No heartbeat")).toBeInTheDocument();
    expect(within(card).getByText(/Port details appear/)).toBeInTheDocument();
  });
});
