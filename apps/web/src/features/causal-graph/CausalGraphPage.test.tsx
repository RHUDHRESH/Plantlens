import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HERO_MOTOR_OVERLOAD } from "../../test-fixtures/heroSnapshot";
import { defaultRoutes, mockFetch, renderPage, seed } from "../operational-map/testUtils";
import { CausalGraphPage } from "./CausalGraphPage";
import { GRAPH_FIXTURE } from "./graphFixture";

afterEach(() => vi.unstubAllGlobals());

describe("CausalGraphPage", () => {
  it("lays out nodes, marks the live root, labels the loop and shows drafts", async () => {
    seed(HERO_MOTOR_OVERLOAD);
    mockFetch(defaultRoutes(HERO_MOTOR_OVERLOAD, { "/api/runtime/causal-graph": GRAPH_FIXTURE }));
    renderPage(<CausalGraphPage />, "/ops/causal");
    expect(await screen.findByRole("button", { name: /3-Phase Motor, Critical, live root/ }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Live situation traced from 3-Phase Motor along 2 approved edges");
    expect(screen.getByText(/L_DRIVE · balancing/)).toBeInTheDocument();
    expect(screen.getByText(/draft/, { selector: "text" })).toBeInTheDocument();
  });

  it("hides draft edges when toggled off", async () => {
    seed(HERO_MOTOR_OVERLOAD);
    mockFetch(defaultRoutes(HERO_MOTOR_OVERLOAD, { "/api/runtime/causal-graph": GRAPH_FIXTURE }));
    renderPage(<CausalGraphPage />, "/ops/causal");
    await screen.findByRole("button", { name: /3-Phase Motor/ }, { timeout: 8000 });
    fireEvent.click(screen.getByRole("checkbox", { name: /draft edge/ }));
    expect(await screen.findByText("Draft edges hidden")).toBeInTheDocument();
  });

  it("opens node details; the coverage link is for engineers only", async () => {
    seed(HERO_MOTOR_OVERLOAD, "operator");
    mockFetch(defaultRoutes(HERO_MOTOR_OVERLOAD, { "/api/runtime/causal-graph": GRAPH_FIXTURE }));
    const { unmount } = renderPage(<CausalGraphPage />, "/ops/causal?asset=MTR-301");
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("MOTOR_301_CURRENT")).toBeInTheDocument();
    expect(within(sheet).queryByRole("link", { name: /Pattern coverage/ })).not.toBeInTheDocument();
    unmount();

    seed(HERO_MOTOR_OVERLOAD, "engineer");
    renderPage(<CausalGraphPage />, "/ops/causal?asset=MTR-301");
    const sheet2 = await screen.findByRole("dialog");
    expect(within(sheet2).getByRole("link", { name: /Pattern coverage/ })).toHaveAttribute("href", "/eng/coverage?asset=MTR-301");
  });
});
