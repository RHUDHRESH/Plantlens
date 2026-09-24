/** Keyboard map for the Studio canvas. Pure: event-ish → action, so it is unit-testable. */

export type ShortcutAction =
  | { type: "undo" }
  | { type: "redo" }
  | { type: "delete" }
  | { type: "selectAll" }
  | { type: "clearSelection" }
  | { type: "nudge"; dx: number; dy: number }
  | { type: "copy" }
  | { type: "cut" }
  | { type: "paste" }
  | { type: "duplicate" }
  | { type: "rename" }
  | { type: "help" }
  | { type: "fitView" }
  | { type: "zoomToSelection" }
  | { type: "toggleSnap" }
  | { type: "zoomIn" }
  | { type: "zoomOut" }
  | { type: "autoLayout" };

export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

export function resolveShortcut(e: KeyLike, mac = isMacPlatform()): ShortcutAction | null {
  const mod = mac ? e.metaKey : e.ctrlKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (mod) {
    if (key === "z") return e.shiftKey ? { type: "redo" } : { type: "undo" };
    if (key === "y" && !mac) return { type: "redo" };
    if (key === "a") return { type: "selectAll" };
    if (key === "c") return { type: "copy" };
    if (key === "x") return { type: "cut" };
    if (key === "v") return { type: "paste" };
    if (key === "d") return { type: "duplicate" };
    if (key === "=" || key === "+") return { type: "zoomIn" };
    if (key === "-") return { type: "zoomOut" };
    return null;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  switch (key) {
    case "Delete":
    case "Backspace":
      return { type: "delete" };
    case "Escape":
      return { type: "clearSelection" };
    case "F2":
      return { type: "rename" };
    case "?":
      return { type: "help" };
    case "ArrowLeft":
      return { type: "nudge", dx: e.shiftKey ? -10 : -1, dy: 0 };
    case "ArrowRight":
      return { type: "nudge", dx: e.shiftKey ? 10 : 1, dy: 0 };
    case "ArrowUp":
      return { type: "nudge", dx: 0, dy: e.shiftKey ? -10 : -1 };
    case "ArrowDown":
      return { type: "nudge", dx: 0, dy: e.shiftKey ? 10 : 1 };
    case "!":
      return { type: "fitView" };
    case "1":
      return e.shiftKey ? { type: "fitView" } : null;
    case "@":
      return { type: "zoomToSelection" };
    case "2":
      return e.shiftKey ? { type: "zoomToSelection" } : null;
    case "g":
      return { type: "toggleSnap" };
    case "l":
      return e.shiftKey ? { type: "autoLayout" } : null;
    default:
      return null;
  }
}

/** Keys inside text inputs belong to the input, not the canvas. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type;
    return !["checkbox", "radio", "button", "range"].includes(type);
  }
  return false;
}

export const SHORTCUT_HELP: { group: string; items: { keys: string[]; label: string }[] }[] = [
  {
    group: "Edit",
    items: [
      { keys: ["Mod", "Z"], label: "Undo" },
      { keys: ["Mod", "Shift", "Z"], label: "Redo (also Ctrl Y)" },
      { keys: ["Delete"], label: "Delete selection" },
      { keys: ["Mod", "C"], label: "Copy" },
      { keys: ["Mod", "X"], label: "Cut" },
      { keys: ["Mod", "V"], label: "Paste" },
      { keys: ["Mod", "D"], label: "Duplicate" },
      { keys: ["F2"], label: "Rename (or double-click)" },
    ],
  },
  {
    group: "Select & move",
    items: [
      { keys: ["Mod", "A"], label: "Select all" },
      { keys: ["Esc"], label: "Clear selection / cancel" },
      { keys: ["Shift", "Click"], label: "Add to selection" },
      { keys: ["Drag"], label: "Marquee select on empty canvas" },
      { keys: ["←↑→↓"], label: "Nudge 1 grid step (Shift: 10)" },
      { keys: ["Alt", "Drag"], label: "Move without snapping" },
      { keys: ["Shift", "L"], label: "Auto-arrange (selection, or everything)" },
    ],
  },
  {
    group: "View",
    items: [
      { keys: ["Space", "Drag"], label: "Pan (or middle mouse)" },
      { keys: ["Shift", "1"], label: "Fit view" },
      { keys: ["Shift", "2"], label: "Zoom to selection" },
      { keys: ["Mod", "+"], label: "Zoom in" },
      { keys: ["Mod", "−"], label: "Zoom out" },
      { keys: ["G"], label: "Toggle snap to grid" },
      { keys: ["?"], label: "This help" },
    ],
  },
];
