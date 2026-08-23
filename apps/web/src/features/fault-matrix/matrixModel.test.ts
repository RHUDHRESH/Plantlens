import { describe, expect, it } from "vitest";
import {
  buildMatrixViewModel,
  extractTagIdFromSymptom,
  getMatrixCell,
  shortTagLabel,
} from "./matrixModel";
import type { FaultMatrix, FaultMatrixScore } from "../../app/schemas/faultMatrix";

describe("extractTagIdFromSymptom", () => {
  it("parses runtime observation labels into tag ids", () => {
    expect(
      extractTagIdFromSymptom(
        "MOTOR_301_CURRENT HIGH (band=warning_high, trend=+1.100, q=GOOD)",
      ),
    ).toBe("MOTOR_301_CURRENT");
    expect(extractTagIdFromSymptom("MOTOR_301_TEMP (no usable data)")).toBe("MOTOR_301_TEMP");
    expect(extractTagIdFromSymptom("BUS_101_V")).toBe("BUS_101_V");
  });
});

describe("buildMatrixViewModel", () => {
  const matrix: FaultMatrix = {
    version: "1.0.0",
    matrix_id: "m",
    faults: [
      {
        id: "F_MOTOR",
        name: "Motor Overload",
        asset_id: "MTR-301",
        symptoms: [
          { tag_id: "MOTOR_301_CURRENT", expected_direction: "HIGH", weight: 1, required: true },
          { tag_id: "MOTOR_301_RPM", expected_direction: "LOW", weight: 0.8, required: true },
          { tag_id: "UNUSED_TAG", expected_direction: "HIGH", weight: 0.2, required: false },
        ],
      },
      {
        id: "F_OTHER",
        name: "Other",
        asset_id: "BAT-101",
        symptoms: [{ tag_id: "BAT_101_V", expected_direction: "LOW", weight: 1, required: true }],
      },
    ],
  };

  it("matches labeled supporting symptoms to authored tag columns", () => {
    const scores: FaultMatrixScore[] = [
      {
        fault_id: "F_MOTOR",
        fault_name: "Motor Overload",
        asset_id: "MTR-301",
        confidence: 0.92,
        coverage: 1,
        contradicted: false,
        supporting_symptoms: [
          "MOTOR_301_CURRENT HIGH (band=warning_high, trend=+1.100, q=GOOD)",
          "MOTOR_301_RPM LOW (band=warning_low, trend=-10, q=GOOD)",
        ],
        contradicting_symptoms: [],
        missing_symptoms: [],
      },
    ];

    const model = buildMatrixViewModel(scores, matrix);
    expect(model.tagIds).toEqual(["MOTOR_301_CURRENT", "MOTOR_301_RPM"]);
    expect(getMatrixCell(model, "F_MOTOR", "MOTOR_301_CURRENT").match).toBe("exact");
    expect(getMatrixCell(model, "F_MOTOR", "MOTOR_301_RPM").match).toBe("exact");
    expect(model.tagIds.every((id) => !id.includes("band="))).toBe(true);
  });

  it("does not promote observation labels as column headers", () => {
    const scores: FaultMatrixScore[] = [
      {
        fault_id: "F_MOTOR",
        fault_name: "Motor Overload",
        asset_id: "MTR-301",
        confidence: 0.5,
        coverage: 0.5,
        contradicted: false,
        supporting_symptoms: ["MOTOR_301_CURRENT HIGH (band=warning_high, trend=+1, q=GOOD)"],
        contradicting_symptoms: [],
        missing_symptoms: ["VIB_X (no usable data)"],
      },
    ];
    const model = buildMatrixViewModel(scores, null);
    expect(model.tagIds).toContain("MOTOR_301_CURRENT");
    expect(model.tagIds).toContain("VIB_X");
    expect(model.tagIds.some((id) => id.includes("("))).toBe(false);
  });

  it("drops missing-only columns from non-top faults", () => {
    const scores: FaultMatrixScore[] = [
      {
        fault_id: "F_MOTOR",
        fault_name: "Motor Overload",
        asset_id: "MTR-301",
        confidence: 0.9,
        coverage: 1,
        contradicted: false,
        supporting_symptoms: ["MOTOR_301_CURRENT HIGH (band=warning_high, trend=+1, q=GOOD)"],
        contradicting_symptoms: [],
        missing_symptoms: [],
      },
      {
        fault_id: "F_OTHER",
        fault_name: "Other",
        asset_id: "BAT-101",
        confidence: 0.1,
        coverage: 0,
        contradicted: false,
        supporting_symptoms: [],
        contradicting_symptoms: [],
        missing_symptoms: ["BAT_101_V (no usable data)"],
      },
    ];
    const model = buildMatrixViewModel(scores, matrix);
    expect(model.tagIds).toEqual(["MOTOR_301_CURRENT"]);
    expect(model.tagIds).not.toContain("BAT_101_V");
    expect(model.tagIds).not.toContain("UNUSED_TAG");
  });
});

describe("shortTagLabel", () => {
  it("keeps short ids intact", () => {
    expect(shortTagLabel("BUS_101_V")).toBe("BUS_101_V");
  });
});
