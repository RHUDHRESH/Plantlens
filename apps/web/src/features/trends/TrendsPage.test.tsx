import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HERO_MOTOR_OVERLOAD } from "../../test-fixtures/heroSnapshot";
import { defaultRoutes, mockFetch, renderPage, seed } from "../operational-map/testUtils";
import { TrendsPage } from "./TrendsPage";

// uPlot needs a real canvas; the page logic around it is what we test here.
const created: { series: unknown[] }[] = [];
vi.mock("uplot", () => {
  class FakePlot {
    width = 600;
    constructor(opts: { series: unknown[] }) {
      created.push({ series: opts.series });
    }
    setData() {}
    setSize() {}
    destroy() {}
    static paths = { stepped: () => () => null };
    static pxRatio = 1;
  }
  return { default: FakePlot };
});
vi.mock("uplot/dist/uPlot.min.css", () => ({}));

afterEach(() => vi.unstubAllGlobals());

describe("TrendsPage", () => {
  it("prompts to pick tags when none are selected", () => {
    seed(HERO_MOTOR_OVERLOAD);
    mockFetch(defaultRoutes(HERO_MOTOR_OVERLOAD));
    renderPage(<TrendsPage />, "/ops/trends");
    expect(screen.getByText("Pick tags to trend")).toBeInTheDocument();
  });

  it("draws one pane per unit for tags from the URL, with legend values", async () => {
    seed(HERO_MOTOR_OVERLOAD);
    created.length = 0;
    mockFetch(
      defaultRoutes(HERO_MOTOR_OVERLOAD, {
        "/api/runtime/trends?tag_ids=MOTOR_301_CURRENT": {
          now: "2026-01-01T10:33:00Z",
          series: [
            { tag_id: "MOTOR_301_CURRENT", unit: "A", asset_id: "MTR-301", points: [["2026-01-01T10:32:14Z", 3.4, "GOOD"]] },
            { tag_id: "BUS_101_V", unit: "V", asset_id: "BUS-101", points: [["2026-01-01T10:32:18Z", 40.5, "GOOD"]] },
          ],
        },
      }),
    );
    renderPage(<TrendsPage />, "/ops/trends?tags=MOTOR_301_CURRENT,BUS_101_V&range=5m");
    expect(await screen.findByText("3.40 A")).toBeInTheDocument();
    expect(screen.getByText("40.5 V")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: /Series in A pane/ })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: /Series in V pane/ })).toBeInTheDocument();
    await waitFor(() => expect(created.length).toBeGreaterThanOrEqual(2));
  });

  it("toggles pause and exposes CSV export", async () => {
    seed(HERO_MOTOR_OVERLOAD);
    mockFetch(defaultRoutes(HERO_MOTOR_OVERLOAD));
    renderPage(<TrendsPage />, "/ops/trends?tags=MOTOR_301_CURRENT");
    const pause = screen.getByRole("button", { name: "Pause" });
    fireEvent.click(pause);
    expect(screen.getByRole("button", { name: "Resume" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeInTheDocument();
  });
});
