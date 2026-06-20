import { describe, expect, it } from "vitest";
import {
  buildHmiAssetStatusMap,
  formatConfidence,
  formatOverallStatus,
  getActiveCausalityAssetPath,
  getPrimaryRootAssetId,
  mapHmiAssetStatusToMapStatus,
} from "./hmiFormatting";
import { motorObstructionHmiState } from "./__fixtures__/plantHmiState.fixture";

describe("hmiFormatting", () => {
  it("maps HMI asset statuses to map statuses", () => {
    expect(mapHmiAssetStatusToMapStatus("healthy")).toBe("normal");
    expect(mapHmiAssetStatusToMapStatus("warning")).toBe("warning");
    expect(mapHmiAssetStatusToMapStatus("fault")).toBe("critical");
    expect(mapHmiAssetStatusToMapStatus("offline")).toBe("offline");
    expect(mapHmiAssetStatusToMapStatus(null)).toBe("unknown");
    expect(mapHmiAssetStatusToMapStatus(undefined)).toBe("unknown");
  });

  it("formats overall status", () => {
    expect(formatOverallStatus("blocked")).toBe("Blocked");
  });

  it("formats confidence with clamping", () => {
    expect(formatConfidence(0.824)).toBe("82%");
    expect(formatConfidence(2)).toBe("100%");
    expect(formatConfidence(-1)).toBe("0%");
    expect(formatConfidence(null)).toBe("—");
    expect(formatConfidence(Number.NaN)).toBe("—");
  });

  it("builds asset status map from HMI state", () => {
    const map = buildHmiAssetStatusMap(motorObstructionHmiState);
    expect(map["MTR-12V"]).toBe("critical");
    expect(map["FAN-01"]).toBe("warning");
  });

  it("returns ordered active causality asset path", () => {
    const path = getActiveCausalityAssetPath(motorObstructionHmiState);
    expect(path).toEqual(["MTR-12V", "FAN-01", "BLW-01"]);
  });

  it("returns primary root asset from candidate", () => {
    expect(getPrimaryRootAssetId(motorObstructionHmiState)).toBe("MTR-12V");
  });
});