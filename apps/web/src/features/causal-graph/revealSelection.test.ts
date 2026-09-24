import { describe, expect, it } from "vitest";
import { revealBox } from "../operational-map/usePanZoom";

// 1000×500 px SVG at client (0,0) showing a 1000×500 content view: 1 px per unit.
const svg = { left: 0, top: 0, right: 1000, bottom: 500 };
const view = { x: 0, y: 0, w: 1000, h: 500 };

describe("revealBox (keep the selected causal node clear of the side sheet)", () => {
  it("does nothing when the node is already in the uncovered area", () => {
    expect(revealBox(view, { x: 100, y: 100, w: 140, h: 60 }, svg, { ...svg, right: 580 })).toBeNull();
  });

  it("pans a node hidden under a right-hand sheet into view, keeping the zoom", () => {
    const next = revealBox(view, { x: 820, y: 200, w: 140, h: 60 }, svg, { ...svg, right: 580 }, 24)!;
    expect(next.w).toBe(view.w);
    expect(next.h).toBe(view.h);
    // Node's right edge must land at sheet-left minus padding: 580 - 24 = 556 → shift 404.
    expect(next.x).toBeCloseTo(404);
    expect(next.y).toBe(0);
  });

  it("accounts for the on-screen scale", () => {
    const zoomed = { x: 0, y: 0, w: 500, h: 250 }; // 2 px per unit
    const next = revealBox(zoomed, { x: 400, y: 50, w: 50, h: 30 }, svg, { ...svg, right: 580 }, 20)!;
    // Right edge at 900 px; must be ≤ 560 px → move 340 px = 170 units.
    expect(next.x).toBeCloseTo(170);
  });
});
