/**
 * Runtime-generated canvas textures (no downloads): PV cell layout, nameplates, drive displays,
 * louvre/perforation patterns. Cached by key; disposed with the materials that use them.
 */
import * as THREE from "three";

const cache = new Map<string, THREE.Texture | null>();

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  return ctx ? [c, ctx] : null;
}

function cached(key: string, make: () => THREE.Texture | null): THREE.Texture | null {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) ?? null;
}

function finish(tex: THREE.Texture, srgb = true): THREE.Texture {
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** Mono-crystalline 6×10 (portrait) half-cut-free module face: cells, busbars, white gaps. */
export function pvModuleTexture(cols = 6, rows = 10): THREE.Texture | null {
  return cached(`pv:${cols}x${rows}`, () => {
    const cellPx = 64;
    const gap = 3;
    const margin = 10;
    const w = margin * 2 + cols * cellPx + (cols - 1) * gap;
    const h = margin * 2 + rows * cellPx + (rows - 1) * gap;
    const made = canvas(w, h);
    if (!made) return null;
    const [c, ctx] = made;
    ctx.fillStyle = "#D9DCDE"; // backsheet showing between cells
    ctx.fillRect(0, 0, w, h);
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const x = margin + k * (cellPx + gap);
        const y = margin + r * (cellPx + gap);
        const g = ctx.createLinearGradient(x, y, x + cellPx, y + cellPx);
        g.addColorStop(0, "#1B2230");
        g.addColorStop(1, "#121824");
        ctx.fillStyle = g;
        // pseudo-square mono cell with chamfered corners
        const ch = 7;
        ctx.beginPath();
        ctx.moveTo(x + ch, y);
        ctx.lineTo(x + cellPx - ch, y);
        ctx.lineTo(x + cellPx, y + ch);
        ctx.lineTo(x + cellPx, y + cellPx - ch);
        ctx.lineTo(x + cellPx - ch, y + cellPx);
        ctx.lineTo(x + ch, y + cellPx);
        ctx.lineTo(x, y + cellPx - ch);
        ctx.lineTo(x, y + ch);
        ctx.closePath();
        ctx.fill();
        // fingers (very faint) and busbars
        ctx.strokeStyle = "rgba(150,160,175,0.10)";
        ctx.lineWidth = 1;
        for (let f = 4; f < cellPx; f += 4) {
          ctx.beginPath();
          ctx.moveTo(x + 2, y + f);
          ctx.lineTo(x + cellPx - 2, y + f);
          ctx.stroke();
        }
        ctx.strokeStyle = "rgba(190,196,204,0.75)";
        ctx.lineWidth = 1.4;
        for (let b = 1; b <= 5; b++) {
          const bx = x + (cellPx * b) / 6;
          ctx.beginPath();
          ctx.moveTo(bx, y);
          ctx.lineTo(bx, y + cellPx);
          ctx.stroke();
        }
      }
    }
    // string ribbons at top & bottom margin
    ctx.fillStyle = "#AEB4BA";
    ctx.fillRect(margin, 3, w - margin * 2, 3);
    ctx.fillRect(margin, h - 6, w - margin * 2, 3);
    return finish(new THREE.CanvasTexture(c));
  });
}

/** Etched aluminium nameplate with rating lines (legible when the camera is close). */
export function nameplateTexture(title: string, lines: string[]): THREE.Texture | null {
  return cached(`np:${title}:${lines.join("|")}`, () => {
    const made = canvas(320, 200);
    if (!made) return null;
    const [c, ctx] = made;
    const g = ctx.createLinearGradient(0, 0, 320, 0);
    g.addColorStop(0, "#C9CDD0");
    g.addColorStop(0.5, "#DADDE0");
    g.addColorStop(1, "#C3C7CA");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 320, 200);
    ctx.strokeStyle = "#5A5F63";
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, 304, 184);
    ctx.fillStyle = "#2A2D30";
    ctx.font = "bold 26px sans-serif";
    ctx.fillText(title, 20, 42);
    ctx.fillRect(20, 52, 280, 2);
    ctx.font = "18px monospace";
    lines.forEach((line, i) => ctx.fillText(line, 20, 82 + i * 26));
    for (const [x, y] of [[16, 16], [304, 16], [16, 184], [304, 184]] as const) {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#7B8084";
      ctx.fill();
    }
    return finish(new THREE.CanvasTexture(c));
  });
}

/** Monochrome drive / HMI display (ISA-101: no colour on a normal screen). */
export function displayTexture(lines: string[], variant: "lcd" | "oled" = "lcd"): THREE.Texture | null {
  return cached(`disp:${variant}:${lines.join("|")}`, () => {
    const made = canvas(256, 160);
    if (!made) return null;
    const [c, ctx] = made;
    ctx.fillStyle = variant === "lcd" ? "#1B2426" : "#0C0E10";
    ctx.fillRect(0, 0, 256, 160);
    ctx.fillStyle = variant === "lcd" ? "#C9D3D3" : "#D8DCDE";
    ctx.font = "bold 34px monospace";
    ctx.fillText(lines[0] ?? "", 14, 50);
    ctx.font = "22px monospace";
    lines.slice(1).forEach((line, i) => ctx.fillText(line, 14, 88 + i * 30));
    return finish(new THREE.CanvasTexture(c));
  });
}

/** Engraved traffolyte equipment tag (black text on white laminate). */
export function tagTexture(text: string): THREE.Texture | null {
  return cached(`tag:${text}`, () => {
    const made = canvas(256, 64);
    if (!made) return null;
    const [c, ctx] = made;
    ctx.fillStyle = "#F2F2EE";
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = "#2A2A2A";
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, 248, 56);
    ctx.fillStyle = "#1E1E1E";
    ctx.font = "bold 34px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text.slice(0, 12), 128, 34);
    return finish(new THREE.CanvasTexture(c));
  });
}

/** Tiled perforation / mesh pattern used as alphaMap for guards and grilles. */
export function perforationTexture(repeat: [number, number]): THREE.Texture | null {
  return cached(`perf:${repeat.join("x")}`, () => {
    const made = canvas(64, 64);
    if (!made) return null;
    const [c, ctx] = made;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = "#000000";
    for (const [x, y] of [[16, 16], [48, 48], [48, 16], [16, 48]] as const) {
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
    return finish(tex, false);
  });
}

export function disposeTextures() {
  for (const t of cache.values()) t?.dispose();
  cache.clear();
}
