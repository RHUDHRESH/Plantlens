import { describe, expect, it, vi } from "vitest";
import {
  executeOperationalCommand,
  getOperationalCommandDocuments,
} from "../commandRegistry";
import type { OperationalSearchDocument } from "../searchTypes";

describe("open_studio command", () => {
  const engineerDocs = getOperationalCommandDocuments({
    role: "engineer",
    mapMode: "2d",
    showLegend: true,
    density: "comfortable",
    rootAssetId: null,
    hasRawAlarms: false,
  });

  const operatorDocs = getOperationalCommandDocuments({
    role: "operator",
    mapMode: "2d",
    showLegend: true,
    density: "comfortable",
    rootAssetId: null,
    hasRawAlarms: false,
  });

  it("includes open_studio for engineer", () => {
    const cmd = engineerDocs.find((d) => d.commandId === "open_studio");
    expect(cmd).toBeDefined();
    expect(cmd?.boost).toBeGreaterThan(0);
  });

  it("excludes open_studio boost for operator", () => {
    const cmd = operatorDocs.find((d) => d.commandId === "open_studio");
    expect(cmd?.boost).toBe(0);
  });

  it("executing open_studio calls openStudioOverview", () => {
    const openStudioOverview = vi.fn();
    const doc = engineerDocs.find((d) => d.commandId === "open_studio") as OperationalSearchDocument;
    executeOperationalCommand(doc, {
      selectAsset: vi.fn(),
      focusAsset: vi.fn(),
      fitPlant: vi.fn(),
      focusRoot: vi.fn(),
      openRawAlarms: vi.fn(),
      setMapMode: vi.fn(),
      setRole: vi.fn(),
      toggleLegend: vi.fn(),
      toggleCompactDensity: vi.fn(),
      openStudioOverview,
    });
    expect(openStudioOverview).toHaveBeenCalledOnce();
  });
});