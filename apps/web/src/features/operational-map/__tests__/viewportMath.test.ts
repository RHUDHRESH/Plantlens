import { describe, expect, it } from "vitest";
import {
  boundsFromNodes,
  boundsToViewBox,
  clientPointToSvgPoint,
  fitBoundsToViewport,
  focusPointViewBox,
  getAssetFocusViewBox,
  getRootFocusViewBox,
  getViewBoxScale,
  getViewportTransform,
  panViewBox,
  viewBoxToString,
  zoomViewBoxAtPoint,
} from "../viewportMath";

describe("boundsFromNodes", () => {
  it("ignores nodes without position", () => {
    const bounds = boundsFromNodes([
      { id: "a" } as { position?: { x: number; y: number } },
      { position: { x: 100, y: 200 } },
      { position: { x: 300, y: 400 } },
    ]);
    expect(bounds.minX).toBe(100 - 80);
    expect(bounds.minY).toBe(200 - 80);
    expect(bounds.maxX).toBe(300 + 80);
    expect(bounds.maxY).toBe(400 + 80);
  });

  it("returns stable fallback bounds when no positioned nodes", () => {
    const bounds = boundsFromNodes([]);
    expect(bounds).toEqual({ minX: 0, minY: 0, maxX: 800, maxY: 400 });
  });
});

describe("boundsToViewBox", () => {
  it("converts bounds to viewBox dimensions", () => {
    const vb = boundsToViewBox({ minX: 10, minY: 20, maxX: 110, maxY: 120 });
    expect(vb).toEqual({ x: 10, y: 20, width: 100, height: 100 });
  });
});

describe("fitBoundsToViewport", () => {
  const bounds = { minX: 0, minY: 0, maxX: 800, maxY: 400 };

  it("preserves aspect ratio for wide viewport", () => {
    const vb = fitBoundsToViewport(bounds, { width: 1600, height: 400 });
    expect(vb.width / vb.height).toBeCloseTo(4, 1);
    expect(vb.x).toBeLessThanOrEqual(0);
  });

  it("preserves aspect ratio for tall viewport", () => {
    const vb = fitBoundsToViewport(bounds, { width: 400, height: 800 });
    expect(vb.width / vb.height).toBeCloseTo(0.5, 1);
    expect(vb.y).toBeLessThanOrEqual(0);
  });

  it("falls back to bounds viewBox when viewport invalid", () => {
    const vb = fitBoundsToViewport(bounds, { width: 0, height: 0 });
    expect(vb).toEqual(boundsToViewBox(bounds));
  });
});

describe("viewBoxToString", () => {
  it("rounds to 2 decimals", () => {
    expect(viewBoxToString({ x: 1.23456, y: 2.34567, width: 3.45678, height: 4.56789 })).toBe(
      "1.23 2.35 3.46 4.57",
    );
  });
});

describe("getViewBoxScale", () => {
  it("returns 1 when base and current widths are equal", () => {
    const vb = { x: 0, y: 0, width: 800, height: 400 };
    expect(getViewBoxScale(vb, vb)).toBe(1);
  });

  it("returns 1 for invalid dimensions", () => {
    expect(getViewBoxScale({ x: 0, y: 0, width: 0, height: 400 }, { x: 0, y: 0, width: 100, height: 100 })).toBe(1);
  });
});

describe("zoomViewBoxAtPoint", () => {
  const base = { x: 0, y: 0, width: 800, height: 400 };
  const current = { x: 0, y: 0, width: 800, height: 400 };

  it("zooms in around a point", () => {
    const pointer = { x: 400, y: 200 };
    const zoomed = zoomViewBoxAtPoint({ current, base, pointer, zoomFactor: 2 });
    expect(zoomed.width).toBeLessThan(current.width);
    expect(zoomed.height).toBeLessThan(current.height);
    const pointerAfter = {
      x: zoomed.x + ((pointer.x - current.x) / current.width) * zoomed.width,
      y: zoomed.y + ((pointer.y - current.y) / current.height) * zoomed.height,
    };
    expect(pointerAfter.x).toBeCloseTo(pointer.x, 0);
    expect(pointerAfter.y).toBeCloseTo(pointer.y, 0);
  });

  it("clamps max scale", () => {
    const tight = { x: 350, y: 175, width: 100, height: 50 };
    const zoomed = zoomViewBoxAtPoint({
      current: tight,
      base,
      pointer: { x: 400, y: 200 },
      zoomFactor: 100,
      maxScale: 6,
    });
    expect(getViewBoxScale(base, zoomed)).toBeLessThanOrEqual(6.01);
  });

  it("clamps min scale", () => {
    const zoomed = zoomViewBoxAtPoint({
      current,
      base,
      pointer: { x: 400, y: 200 },
      zoomFactor: 0.01,
      minScale: 0.5,
    });
    expect(getViewBoxScale(base, zoomed)).toBeGreaterThanOrEqual(0.49);
  });
});

describe("panViewBox", () => {
  it("shifts x and y by drag delta", () => {
    const current = { x: 10, y: 20, width: 100, height: 50 };
    const panned = panViewBox(current, 5, 10);
    expect(panned.x).toBe(5);
    expect(panned.y).toBe(10);
    expect(panned.width).toBe(100);
    expect(panned.height).toBe(50);
  });
});

describe("clientPointToSvgPoint", () => {
  it("maps center of SVG rect to center of viewBox", () => {
    const svgRect = { left: 0, top: 0, width: 200, height: 100 } as DOMRect;
    const viewBox = { x: 0, y: 0, width: 800, height: 400 };
    const point = clientPointToSvgPoint(100, 50, svgRect, viewBox);
    expect(point.x).toBeCloseTo(400, 0);
    expect(point.y).toBeCloseTo(200, 0);
  });
});

describe("focusPointViewBox", () => {
  const base = { x: 0, y: 0, width: 800, height: 400 };

  it("centers asset and preserves aspect ratio", () => {
    const vb = focusPointViewBox({ x: 400, y: 200 }, base, { width: 800, height: 400 }, 2);
    expect(vb.x + vb.width / 2).toBeCloseTo(400, 0);
    expect(vb.y + vb.height / 2).toBeCloseTo(200, 0);
    expect(vb.width / vb.height).toBeCloseTo(2, 1);
  });
});

describe("getAssetFocusViewBox and getRootFocusViewBox", () => {
  const base = { x: 0, y: 0, width: 800, height: 400 };
  const viewport = { width: 800, height: 400 };
  const point = { x: 200, y: 100 };

  it("getAssetFocusViewBox uses higher zoom than root", () => {
    const asset = getAssetFocusViewBox(point, base, viewport);
    const root = getRootFocusViewBox(point, base, viewport);
    expect(asset.width).toBeLessThan(root.width);
  });
});

describe("getViewportTransform", () => {
  it("maps scale to zoomBand", () => {
    const base = { x: 0, y: 0, width: 800, height: 400 };
    const current = { x: 0, y: 0, width: 400, height: 200 };
    const transform = getViewportTransform(base, current);
    expect(transform.scale).toBe(2);
    expect(transform.zoomBand).toBe("asset");
  });
});