import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InstantiationResult, PatternDetail } from "../../api/v2";
import { renderAt, setRole } from "../approvals/testUtils";
import { PatternLibraryPage } from "./PatternLibraryPage";

const pattern: PatternDetail = {
  pattern_id: "vfd.overcurrent_trip",
  version: "1.0.0",
  failure_mode: "overcurrent_trip",
  title: "Output overcurrent trip",
  category: "electrical",
  severity: "critical",
  description: "Output current exceeds the drive limit.",
  required_roles: ["current", "drive_trip"],
  optional_roles: ["speed"],
  trigger_role: "current",
  symptoms: [
    { role: "current", direction: "rise", onset_lag_ms: [0, 0], weight: 1, threshold_hint: { relative_to_nominal: 2 } },
    { role: "drive_trip", direction: "trip", onset_lag_ms: [0, 50], weight: 0.9 },
  ],
  propagation: [{ relation: "controlled", effect_role: "speed", direction: "fall", polarity: "-", lag_ms: [0, 500], edge_type: "structural_load_effect" }],
  discriminators: [{ vs_pattern: "vfd.current_limit_foldback", rule: "Trip is instant.", first_role: "current", then_role: "drive_trip" }],
  checks: [
    { order: 1, text: "Read the trip log.", requires_isolation: false },
    { order: 2, text: "Megger the motor cable.", requires_isolation: true },
  ],
  signatures: [{ domain: "trend", description: "Current step", formula: "di/dt > k" }],
  references: ["IEC 61800-5-1"],
};

const libraries = {
  pattern_count: 2,
  libraries: [
    {
      component_type: "vfd",
      display_name: "Variable frequency drive",
      description: "",
      asset_type_aliases: ["drive.inverter"],
      pattern_count: 1,
      patterns: [{ pattern_id: "vfd.overcurrent_trip", title: "Output overcurrent trip", category: "electrical", severity: "critical", required_roles: ["current", "drive_trip"] }],
    },
    {
      component_type: "dc_bus",
      display_name: "DC bus",
      description: "",
      asset_type_aliases: ["distribution.dc_bus"],
      pattern_count: 1,
      patterns: [{ pattern_id: "dc_bus.ground_fault", title: "Ground fault", category: "insulation", severity: "critical", required_roles: ["insulation_resistance"] }],
    },
  ],
};

const ambiguous: InstantiationResult = {
  pattern_id: "vfd.overcurrent_trip",
  pattern_version: "1.0.0",
  asset_id: "INV-102",
  ok: false,
  bindings: {
    current: { tag_id: null, method: "ambiguous", candidates: ["INV_102_I", "VFD_I"] },
    drive_trip: { tag_id: "INV_102_UNDERVOLTAGE", method: "signal_type", candidates: [] },
  },
  missing_required: ["current"],
  missing_optional: [],
  neighbours: { controlled: ["MTR-301"] },
  change_set: null,
  unresolved: [],
  notes: [],
};

const resolved: InstantiationResult = {
  ...ambiguous,
  ok: true,
  bindings: { ...ambiguous.bindings, current: { tag_id: "VFD_I", method: "explicit", candidates: [] } },
  missing_required: [],
  change_set: {
    title: "Output overcurrent trip on Motor Inverter",
    summary: "1 proposed change",
    source: "pattern_library",
    ops: [{ op: "upsert_node", node: { id: "INV-102", evidence_tags: ["VFD_I"] } }],
  },
};

const previewMutate = vi.fn();
let call = 0;

vi.mock("../../api/queries", () => ({
  usePatternLibraries: () => ({ data: libraries, isLoading: false, error: null }),
  usePattern: (id: string | null) => ({
    data: id ? { pattern, component_type: "vfd", roles: [{ role: "current", quantity: "drive output current", units: ["A"] }] } : undefined,
    isLoading: false,
    error: null,
  }),
  useInstantiatePattern: () => ({
    mutate: (args: unknown, opts: { onSuccess: (d: unknown) => void }) => {
      previewMutate(args);
      call += 1;
      opts.onSuccess({ result: call === 1 ? ambiguous : resolved, bundle_rev: 2, change: null });
    },
    reset: vi.fn(),
    isPending: false,
    error: null,
  }),
}));

vi.mock("../approvals/engData", () => ({
  useCompiledIndexes: () => ({
    data: {
      assets: [
        { id: "INV-102", display_name: "Motor Inverter", type: "drive.inverter" },
        { id: "MTR-301", display_name: "3-Phase Motor", type: "load.motor_3phase" },
      ],
      tags: {},
    },
    isLoading: false,
    error: null,
  }),
  useUnitFor: () => () => undefined,
}));

vi.mock("../approvals/elkLayout", () => ({ useGraphLayout: () => ({ layout: null, error: false }), pathFor: () => "" }));

describe("PatternLibraryPage", () => {
  beforeEach(() => {
    call = 0;
    previewMutate.mockReset();
    setRole("engineer");
  });

  it("renders the rail, list and detail sections", () => {
    renderAt(<PatternLibraryPage />, { path: "/eng/library/:patternId", route: "/eng/library/vfd.overcurrent_trip" });
    const rail = screen.getByRole("navigation", { name: "Component types" });
    expect(within(rail).getByRole("button", { name: /Variable frequency drive\s*1/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Output overcurrent trip" })).toBeInTheDocument();
    expect(screen.getByText("vfd.overcurrent_trip@1.0.0")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /Symptom onset windows/ })).toBeInTheDocument();
    expect(screen.getByText("> 2× nominal")).toBeInTheDocument();
    expect(screen.getByLabelText("current first, then drive_trip")).toBeInTheDocument();
    expect(screen.getByText("Requires isolation")).toBeInTheDocument();
    expect(screen.getByText("di/dt > k")).toBeInTheDocument();
  });

  it("filters the list by search", () => {
    renderAt(<PatternLibraryPage />, { path: "/eng/library", route: "/eng/library" });
    expect(screen.getByText("2 patterns")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search patterns" }), { target: { value: "ground" } });
    expect(screen.getByText("1 pattern")).toBeInTheDocument();
  });

  it("hides Apply to asset for roles that cannot author changes", () => {
    setRole("operator");
    renderAt(<PatternLibraryPage />, { path: "/eng/library/:patternId", route: "/eng/library/vfd.overcurrent_trip" });
    expect(screen.queryByRole("button", { name: "Apply to asset…" })).not.toBeInTheDocument();
  });

  it("resolves an ambiguous binding and re-previews with explicit bindings", () => {
    renderAt(<PatternLibraryPage />, { path: "/eng/library/:patternId", route: "/eng/library/vfd.overcurrent_trip" });
    fireEvent.click(screen.getByRole("button", { name: "Apply to asset…" }));
    const dialog = screen.getByRole("dialog");
    // Only assets matching the library's asset_type_aliases are offered by default.
    expect(within(dialog).queryByText("MTR-301")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("radio", { name: /INV-102/ }));
    expect(previewMutate).toHaveBeenLastCalledWith({ patternId: "vfd.overcurrent_trip", assetId: "INV-102", submit: false });
    expect(within(dialog).getByText("Ambiguous — choose")).toBeInTheDocument();
    // Ambiguity is not reported as a missing sensor.
    expect(within(dialog).queryByText(/Observability gap/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Submit for review" })).toBeDisabled();

    fireEvent.change(within(dialog).getByRole("combobox", { name: "Tag for current" }), { target: { value: "VFD_I" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Re-preview with my bindings" }));
    expect(previewMutate).toHaveBeenLastCalledWith({ patternId: "vfd.overcurrent_trip", assetId: "INV-102", submit: false, bindings: { current: "VFD_I" } });
    expect(within(dialog).getByText("Explicit (you chose)")).toBeInTheDocument();
    expect(within(dialog).getByText("Drafted change set")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Submit for review" })).toBeEnabled();
  });
});
