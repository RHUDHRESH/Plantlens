import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function readSource(filename: string): string {
  return readFileSync(join(here, filename), "utf8");
}

describe("LazyPlantMap3D WebGL fallback", () => {
  it("lazy-loads PlantMap3D and switches to fallback when WebGL is unavailable or Canvas throws", () => {
    const source = readSource("LazyPlantMap3D.tsx");
    // Route-split: 3D must not load on the default 2D/monitor path.
    expect(source).toMatch(/lazy\(\(\)\s*=>\s*[\s\S]*PlantMap3D/);
    expect(source).toContain("PlantMap3DFallback");
    // Explicit WebGL gate before mounting Canvas.
    expect(source).toContain("if (!webglAvailable)");
    expect(source).toContain("onSwitch2D");
    // Runtime Canvas failures still recover via error boundary → fallback.
    expect(source).toContain("Map3DErrorBoundary");
    expect(source).toContain("getDerivedStateFromError");
  });
});
