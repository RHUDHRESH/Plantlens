import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectRuntimeSocket } from "./ws";
import { useRuntimeStore } from "../app/store/runtime";
import { HERO_MOTOR_OVERLOAD } from "../test-fixtures/heroSnapshot";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  close() {
    this.closed = true;
    this.onclose?.();
  }

  emitOpen() {
    this.onopen?.();
  }

  emitMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

describe("connectRuntimeSocket", () => {
  beforeEach(() => {
    useRuntimeStore.getState().reset();
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies valid runtime.snapshot messages", () => {
    const handle = connectRuntimeSocket();
    const ws = MockWebSocket.instances[0]!;
    ws.emitOpen();
    ws.emitMessage({
      type: "runtime.snapshot",
      ts: "t1",
      state: HERO_MOTOR_OVERLOAD,
    });
    expect(useRuntimeStore.getState().connection).toBe("live");
    expect(useRuntimeStore.getState().assetStatus["MTR-301"]).toBe("critical");
    handle.close();
  });

  it("ignores malformed payloads", () => {
    connectRuntimeSocket();
    const ws = MockWebSocket.instances[0]!;
    ws.emitOpen();
    ws.emitMessage({ type: "runtime.snapshot", state: null });
    ws.emitMessage("not-json");
    expect(useRuntimeStore.getState().hasSnapshot).toBe(false);
  });

  it("reconnect opens a new socket without duplicating handler state", async () => {
    vi.useFakeTimers();
    const handle = connectRuntimeSocket();
    const ws1 = MockWebSocket.instances[0]!;
    ws1.emitOpen();
    ws1.emitMessage({ type: "runtime.snapshot", ts: "t1", state: HERO_MOTOR_OVERLOAD });
    ws1.close();
    await vi.advanceTimersByTimeAsync(600);
    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(2);
    const ws2 = MockWebSocket.instances[1]!;
    ws2.emitOpen();
    ws2.emitMessage({
      type: "runtime.snapshot",
      ts: "t2",
      state: { ...HERO_MOTOR_OVERLOAD, active_alarms: [] },
    });
    expect(useRuntimeStore.getState().activeAlarms).toHaveLength(0);
    handle.close();
    vi.useRealTimers();
  });
});