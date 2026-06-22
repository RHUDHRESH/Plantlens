import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useStudioRoute } from "../useStudioRoute";

describe("useStudioRoute", () => {
  it("is closed by default", () => {
    const { result } = renderHook(() => useStudioRoute());
    expect(result.current.open).toBe(false);
    expect(result.current.route.surface).toBe("overview");
  });

  it("openOverview opens overview surface", () => {
    const { result } = renderHook(() => useStudioRoute());
    act(() => result.current.openOverview());
    expect(result.current.open).toBe(true);
    expect(result.current.route.surface).toBe("overview");
    expect(result.current.route.targetId).toBeNull();
  });

  it("openStudio uses intent route", () => {
    const { result } = renderHook(() => useStudioRoute());
    act(() =>
      result.current.openStudio({
        targetKind: "tag",
        targetId: "MOTOR_301_CURRENT",
        family: "tag_map",
        mode: "edit_intent",
      }),
    );
    expect(result.current.open).toBe(true);
    expect(result.current.route.surface).toBe("tag");
    expect(result.current.route.targetId).toBe("MOTOR_301_CURRENT");
    expect(result.current.route.mode).toBe("edit_intent");
  });

  it("closeStudio closes shell", () => {
    const { result } = renderHook(() => useStudioRoute());
    act(() => result.current.openOverview());
    act(() => result.current.closeStudio());
    expect(result.current.open).toBe(false);
  });
});