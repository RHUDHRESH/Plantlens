import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderAt, setRole } from "../approvals/testUtils";
import { CoveragePage } from "./CoveragePage";

const coverage: Record<string, unknown> = {
  "MTR-301": {
    asset_id: "MTR-301",
    asset_type: "load.motor_3phase",
    bundle_rev: 2,
    observable: 1,
    total: 2,
    patterns: [
      { pattern_id: "induction_motor.mechanical_overload", title: "Mechanical overload", category: "mechanical", severity: "warning", observable: true, missing_required: [], missing_optional: ["torque"], unresolved: [] },
      { pattern_id: "induction_motor.bearing_defect", title: "Bearing defect", category: "mechanical", severity: "warning", observable: false, missing_required: ["bearing_envelope"], missing_optional: [], unresolved: [] },
    ],
  },
  "LD-201": { asset_id: "LD-201", asset_type: "load.lamp", bundle_rev: 2, observable: 0, total: 0, patterns: [] },
};

vi.mock("../../api/v2", () => ({ getCoverage: (id: string) => Promise.resolve(coverage[id]) }));

vi.mock("../approvals/engData", () => ({
  useCompiledIndexes: () => ({
    data: {
      assets: [
        { id: "LD-201", display_name: "Lamp Load", type: "load.lamp" },
        { id: "MTR-301", display_name: "3-Phase Motor", type: "load.motor_3phase" },
      ],
      tags: {},
    },
    isLoading: false,
    error: null,
  }),
}));

describe("CoveragePage", () => {
  beforeEach(() => setRole("engineer"));

  it("shows per-asset observability, the pattern table and recommendations", async () => {
    renderAt(<CoveragePage />, { path: "/eng/coverage", route: "/eng/coverage?asset=MTR-301" });
    expect(await screen.findByText("1/2")).toBeInTheDocument();
    expect(screen.getByText("no library")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "MTR-301 observability" })).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByRole("link", { name: "Bearing defect" })).toBeInTheDocument();
    expect(screen.getAllByText("bearing_envelope").length).toBeGreaterThan(0);
    expect(screen.getByText("bearing_envelope", { selector: ".cov-rec__role" })).toBeInTheDocument();
  });

  it("switches to the matrix view", async () => {
    renderAt(<CoveragePage />, { path: "/eng/coverage", route: "/eng/coverage?asset=MTR-301" });
    await screen.findByText("1/2");
    fireEvent.click(screen.getByRole("radio", { name: "Matrix" }));
    expect(screen.getByRole("table", { name: /by asset and category/ })).toBeInTheDocument();
    expect(screen.getByTitle("MTR-301 · mechanical: 1 of 2 observable")).toHaveTextContent("1/2");
  });

  it("explains assets without a pattern library", async () => {
    renderAt(<CoveragePage />, { path: "/eng/coverage", route: "/eng/coverage?asset=LD-201" });
    expect(await screen.findByText(/No pattern library covers load.lamp/)).toBeInTheDocument();
  });
});
