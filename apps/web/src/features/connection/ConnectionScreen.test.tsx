import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectionScreen } from "./ConnectionScreen";
import { ConnectionApiError } from "./api";
import type { ScanRow } from "./types";

const listPorts = vi.fn();
const getConnectionStatus = vi.fn();
const getModelBundle = vi.fn();
const connectModbus = vi.fn();
const disconnectModbus = vi.fn();
const scanRegisters = vi.fn();
const testRead = vi.fn();
const commitBindings = vi.fn();

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    listPorts: (...args: unknown[]) => listPorts(...args),
    getConnectionStatus: (...args: unknown[]) => getConnectionStatus(...args),
    getModelBundle: (...args: unknown[]) => getModelBundle(...args),
    connectModbus: (...args: unknown[]) => connectModbus(...args),
    disconnectModbus: (...args: unknown[]) => disconnectModbus(...args),
    scanRegisters: (...args: unknown[]) => scanRegisters(...args),
    testRead: (...args: unknown[]) => testRead(...args),
    commitBindings: (...args: unknown[]) => commitBindings(...args),
  };
});

const DEFAULT_STATUS = {
  connected: false,
  port: null,
  slaveId: null,
  pollHz: null,
  lastPollTs: null,
  okCount: 0,
  errorCount: 0,
  lastError: null,
};

const GOOD_ROW: ScanRow = {
  channelRef: "modbus:slave1:ireg:0",
  register: 0,
  regType: "input",
  dataType: "float32",
  wordOrder: "AB",
  raw: 24.2,
  decoded: 24.2,
  responding: true,
  suggestedTag: "BUS_101_V",
  quality: "GOOD",
};

const BAD_ROW: ScanRow = {
  channelRef: "modbus:slave1:ireg:4",
  register: 4,
  regType: "input",
  dataType: "float32",
  wordOrder: "AB",
  raw: null,
  decoded: null,
  responding: false,
  suggestedTag: null,
  quality: "BAD",
};

function wrap(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("ConnectionScreen", () => {
  beforeEach(() => {
    listPorts.mockReset();
    getConnectionStatus.mockReset();
    getModelBundle.mockReset();
    connectModbus.mockReset();
    disconnectModbus.mockReset();
    scanRegisters.mockReset();
    testRead.mockReset();
    commitBindings.mockReset();

    listPorts.mockResolvedValue([]);
    getConnectionStatus.mockResolvedValue(DEFAULT_STATUS);
    getModelBundle.mockResolvedValue({ tags: [] });
  });

  it("renders title and read-only safety copy", async () => {
    wrap(<ConnectionScreen />);
    expect(await screen.findByText("Connection / Commissioning")).toBeInTheDocument();
    expect(screen.getAllByText(/Read-only/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/No control writes/i)).toBeInTheDocument();
    expect(screen.getByText("READ-ONLY")).toBeInTheDocument();
  });

  it("renders no ports found state", async () => {
    wrap(<ConnectionScreen />);
    expect(
      await screen.findByText("No serial ports returned by /api/ports."),
    ).toBeInTheDocument();
  });

  it("disables connect button until port selected", async () => {
    wrap(<ConnectionScreen />);
    await screen.findByText("Connection / Commissioning");
    expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
    listPorts.mockResolvedValue(["COM5"]);
    fireEvent.click(screen.getByRole("button", { name: "Refresh ports" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Connect" })).not.toBeDisabled();
    });
  });

  it("shows endpoint unavailable banner when /api/ports fails", async () => {
    listPorts.mockRejectedValue(new ConnectionApiError("GET /api/ports", "Not found", 404));
    wrap(<ConnectionScreen />);
    const banner = await screen.findByRole("alert");
    expect(banner).toHaveTextContent("Backend seam incomplete");
    expect(banner).toHaveTextContent("GET /api/ports");
    expect(banner).toHaveTextContent("failed");
  });

  it("renders canonical scan rows", async () => {
    scanRegisters.mockResolvedValue([GOOD_ROW]);
    wrap(<ConnectionScreen />);
    await screen.findByText("Connection / Commissioning");
    fireEvent.click(screen.getAllByRole("button", { name: "Scan" })[0]!);
    await waitFor(() => {
      expect(screen.getByText("BUS_101_V")).toBeInTheDocument();
      expect(screen.getAllByText("24.2").length).toBeGreaterThan(0);
    });
  });

  it("renders BAD scan row decoded as em dash, not zero", async () => {
    scanRegisters.mockResolvedValue([BAD_ROW]);
    wrap(<ConnectionScreen />);
    await screen.findByText("Connection / Commissioning");
    fireEvent.click(screen.getAllByRole("button", { name: "Scan" })[0]!);
    await waitFor(() => {
      const table = screen.getByRole("table");
      const row = within(table).getByText("modbus:slave1:ireg:4").closest("tr")!;
      expect(within(row).getAllByText("—").length).toBeGreaterThan(0);
      expect(within(row).queryByText(/^0$/)).not.toBeInTheDocument();
    });
  });

  it("opens Binding Inspector when row is selected", async () => {
    scanRegisters.mockResolvedValue([GOOD_ROW]);
    wrap(<ConnectionScreen />);
    await screen.findByText("Connection / Commissioning");
    fireEvent.click(screen.getAllByRole("button", { name: "Scan" })[0]!);
    await waitFor(() => expect(screen.getByText("BUS_101_V")).toBeInTheDocument());
    fireEvent.click(screen.getByText("modbus:slave1:ireg:0"));
    expect(await screen.findByDisplayValue("BUS_101_V")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test read" })).toBeInTheDocument();
  });

  it("shows bottom commit bar after adding pending binding", async () => {
    scanRegisters.mockResolvedValue([GOOD_ROW]);
    wrap(<ConnectionScreen />);
    await screen.findByText("Connection / Commissioning");
    fireEvent.click(screen.getAllByRole("button", { name: "Scan" })[0]!);
    await waitFor(() => expect(screen.getByText("BUS_101_V")).toBeInTheDocument());
    fireEvent.click(screen.getByText("modbus:slave1:ireg:0"));
    const equipment = await screen.findByLabelText("Equipment");
    fireEvent.change(equipment, { target: { value: "BUS-101" } });
    fireEvent.click(screen.getByRole("button", { name: /Add pending binding/i }));
    expect(await screen.findByText(/1 pending binding change/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Commit to model" })).toBeInTheDocument();
  });

  it("clears pending bindings on commit success", async () => {
    scanRegisters.mockResolvedValue([GOOD_ROW]);
    commitBindings.mockResolvedValue({ status: "ok", audit_id: "audit-42" });
    wrap(<ConnectionScreen />);
    await screen.findByText("Connection / Commissioning");
    fireEvent.click(screen.getAllByRole("button", { name: "Scan" })[0]!);
    await waitFor(() => expect(screen.getByText("BUS_101_V")).toBeInTheDocument());
    fireEvent.click(screen.getByText("modbus:slave1:ireg:0"));
    fireEvent.change(await screen.findByLabelText("Equipment"), {
      target: { value: "BUS-101" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add pending binding/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Commit to model" }));
    await waitFor(() => {
      expect(screen.queryByText(/pending binding change/i)).not.toBeInTheDocument();
      expect(screen.getByText(/audit-42/i)).toBeInTheDocument();
    });
  });

  it("keeps pending bindings on commit failure", async () => {
    scanRegisters.mockResolvedValue([GOOD_ROW]);
    commitBindings.mockRejectedValue(new ConnectionApiError("POST /api/bindings", "Write failed", 500));
    wrap(<ConnectionScreen />);
    await screen.findByText("Connection / Commissioning");
    fireEvent.click(screen.getAllByRole("button", { name: "Scan" })[0]!);
    await waitFor(() => expect(screen.getByText("BUS_101_V")).toBeInTheDocument());
    fireEvent.click(screen.getByText("modbus:slave1:ireg:0"));
    fireEvent.change(await screen.findByLabelText("Equipment"), {
      target: { value: "BUS-101" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add pending binding/i }));
    const footer = await screen.findByLabelText(/Pending bindings/i);
    fireEvent.click(screen.getByRole("button", { name: "Commit to model" }));
    await waitFor(() => {
      expect(footer).toHaveTextContent(/1 pending binding change/i);
      expect(screen.getByRole("alert")).toHaveTextContent("Write failed");
    });
  });

  async function stageAndCommitBinding() {
    scanRegisters.mockResolvedValue([GOOD_ROW]);
    commitBindings.mockResolvedValue({ status: "ok", audit_id: "audit-42" });
    wrap(<ConnectionScreen />);
    await screen.findByText("Connection / Commissioning");
    fireEvent.click(screen.getAllByRole("button", { name: "Scan" })[0]!);
    await waitFor(() => expect(screen.getByText("BUS_101_V")).toBeInTheDocument());
    fireEvent.click(screen.getByText("modbus:slave1:ireg:0"));
    fireEvent.change(await screen.findByLabelText("Equipment"), {
      target: { value: "BUS-101" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add pending binding/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Commit to model" }));
    await waitFor(() => expect(screen.getByText(/Model bindings committed/i)).toBeInTheDocument());
  }

  it("shows pending commit in runtime verification before commit", async () => {
    scanRegisters.mockResolvedValue([GOOD_ROW]);
    wrap(<ConnectionScreen />);
    await screen.findByText("Connection / Commissioning");
    fireEvent.click(screen.getAllByRole("button", { name: "Scan" })[0]!);
    await waitFor(() => expect(screen.getByText("BUS_101_V")).toBeInTheDocument());
    fireEvent.click(screen.getByText("modbus:slave1:ireg:0"));
    fireEvent.change(await screen.findByLabelText("Equipment"), {
      target: { value: "BUS-101" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add pending binding/i }));
    expect(await screen.findByText("Pending commit")).toBeInTheDocument();
  });

  it("shows Waiting for runtime after commit when tag not in runtimeTags", async () => {
    await stageAndCommitBinding();
    expect(screen.getByText("Waiting for runtime")).toBeInTheDocument();
    expect(screen.getByText(/waiting for the first runtime TagFrame/i)).toBeInTheDocument();
  });

  it("shows Live verification when runtimeTags has committed GOOD tag", async () => {
    scanRegisters.mockResolvedValue([GOOD_ROW]);
    commitBindings.mockResolvedValue({ status: "ok" });
    const runtimeTags = {
      BUS_101_V: {
        tag_id: "BUS_101_V",
        asset_id: "BUS-101",
        value: 24.2,
        unit: "V",
        quality: "GOOD",
        timestamp: "2026-01-01T10:32:14Z",
        source: "modbus_rtu",
      },
    };
    wrap(<ConnectionScreen runtimeTags={runtimeTags} />);
    await screen.findByText("Connection / Commissioning");
    fireEvent.click(screen.getAllByRole("button", { name: "Scan" })[0]!);
    await waitFor(() => expect(screen.getByText("BUS_101_V")).toBeInTheDocument());
    fireEvent.click(screen.getByText("modbus:slave1:ireg:0"));
    fireEvent.change(await screen.findByLabelText("Equipment"), {
      target: { value: "BUS-101" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add pending binding/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Commit to model" }));
    await waitFor(() => {
      const verification = screen.getByText("Runtime verification").closest("div")!;
      expect(within(verification).getByText("Live")).toBeInTheDocument();
      expect(within(verification).getByText(/24\.2 V/)).toBeInTheDocument();
    });
  });

  it("shows em dash for BAD live tag in runtime verification", async () => {
    scanRegisters.mockResolvedValue([GOOD_ROW]);
    commitBindings.mockResolvedValue({ status: "ok" });
    const runtimeTags = {
      BUS_101_V: {
        tag_id: "BUS_101_V",
        value: 0,
        unit: "V",
        quality: "BAD",
        timestamp: "2026-01-01T10:32:14Z",
      },
    };
    wrap(<ConnectionScreen runtimeTags={runtimeTags} />);
    await screen.findByText("Connection / Commissioning");
    fireEvent.click(screen.getAllByRole("button", { name: "Scan" })[0]!);
    await waitFor(() => expect(screen.getByText("BUS_101_V")).toBeInTheDocument());
    fireEvent.click(screen.getByText("modbus:slave1:ireg:0"));
    fireEvent.change(await screen.findByLabelText("Equipment"), {
      target: { value: "BUS-101" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add pending binding/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Commit to model" }));
    await waitFor(() => {
      const verification = screen.getByText("Runtime verification").closest("div")!;
      expect(within(verification).getByText("Bad")).toBeInTheDocument();
      expect(within(verification).getAllByText("—").length).toBeGreaterThan(0);
    });
  });

  it("calls onOpenAtlas with asset id when live tag verified", async () => {
    const onOpenAtlas = vi.fn();
    scanRegisters.mockResolvedValue([GOOD_ROW]);
    commitBindings.mockResolvedValue({ status: "ok" });
    const runtimeTags = {
      BUS_101_V: {
        tag_id: "BUS_101_V",
        asset_id: "BUS-101",
        value: 24.2,
        unit: "V",
        quality: "GOOD",
        timestamp: "2026-01-01T10:32:14Z",
      },
    };
    wrap(<ConnectionScreen runtimeTags={runtimeTags} onOpenAtlas={onOpenAtlas} />);
    await screen.findByText("Connection / Commissioning");
    fireEvent.click(screen.getAllByRole("button", { name: "Scan" })[0]!);
    await waitFor(() => expect(screen.getByText("BUS_101_V")).toBeInTheDocument());
    fireEvent.click(screen.getByText("modbus:slave1:ireg:0"));
    fireEvent.change(await screen.findByLabelText("Equipment"), {
      target: { value: "BUS-101" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add pending binding/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Commit to model" }));
    const openBtn = await screen.findByRole("button", { name: "Open in Atlas" });
    fireEvent.click(openBtn);
    expect(onOpenAtlas).toHaveBeenCalledWith("BUS-101");
  });

  it("does not mark tag committed on commit failure", async () => {
    scanRegisters.mockResolvedValue([GOOD_ROW]);
    commitBindings.mockRejectedValue(new ConnectionApiError("POST /api/bindings", "Write failed", 500));
    wrap(<ConnectionScreen />);
    await screen.findByText("Connection / Commissioning");
    fireEvent.click(screen.getAllByRole("button", { name: "Scan" })[0]!);
    await waitFor(() => expect(screen.getByText("BUS_101_V")).toBeInTheDocument());
    fireEvent.click(screen.getByText("modbus:slave1:ireg:0"));
    fireEvent.change(await screen.findByLabelText("Equipment"), {
      target: { value: "BUS-101" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add pending binding/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Commit to model" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Write failed"));
    expect(screen.queryByText("Waiting for runtime")).not.toBeInTheDocument();
  });

  it("clears selected row on Escape", async () => {
    scanRegisters.mockResolvedValue([GOOD_ROW]);
    wrap(<ConnectionScreen />);
    await screen.findByText("Connection / Commissioning");
    fireEvent.click(screen.getAllByRole("button", { name: "Scan" })[0]!);
    await waitFor(() => expect(screen.getByText("BUS_101_V")).toBeInTheDocument());
    fireEvent.click(screen.getByText("modbus:slave1:ireg:0"));
    expect(await screen.findByRole("button", { name: "Test read" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.getByText("Select a channel")).toBeInTheDocument();
    });
  });
});