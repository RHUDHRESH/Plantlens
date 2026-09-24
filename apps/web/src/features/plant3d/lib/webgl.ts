/** WebGL capability probe (cached). jsdom and locked-down browsers return false. */
let cached: boolean | null = null;

export function isWebGLAvailable(): boolean {
  if (cached !== null) return cached;
  try {
    if (typeof document === "undefined") return (cached = false);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    cached = !!ctx;
  } catch {
    cached = false;
  }
  return cached;
}

export function resetWebGLProbe() {
  cached = null;
}
