import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useReducedMotion } from "./useReducedMotion";

describe("useReducedMotion", () => {
  it("reflects matchMedia preference", () => {
    const listeners: Array<() => void> = [];
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener: (_: string, cb: () => void) => listeners.push(cb),
      removeEventListener: () => {},
    }));

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);

    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      media: "",
      addEventListener: (_: string, cb: () => void) => listeners.push(cb),
      removeEventListener: () => {},
    }));
    act(() => listeners.forEach((l) => l()));
    vi.unstubAllGlobals();
  });
});