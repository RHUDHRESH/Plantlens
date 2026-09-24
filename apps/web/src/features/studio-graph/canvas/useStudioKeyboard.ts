import { useEffect, useRef } from "react";
import { isEditableTarget, resolveShortcut, type ShortcutAction } from "../model/shortcuts";
import { useStudioStore } from "../studioStore";
import type { StudioActions } from "./useStudioActions";

const MUTATING = new Set<ShortcutAction["type"]>(["undo", "redo", "delete", "nudge", "cut", "paste", "duplicate", "rename"]);

/** Runs a resolved shortcut. Exported for tests. */
export function runShortcut(action: ShortcutAction, actions: Pick<StudioActions, "nudge" | "fitView" | "zoomToSelection" | "zoomIn" | "zoomOut">, opts: { readOnly: boolean; onOpenHelp: () => void }): boolean {
  if (opts.readOnly && MUTATING.has(action.type)) return false;
  const s = useStudioStore.getState();
  switch (action.type) {
    case "undo":
      s.undo();
      return true;
    case "redo":
      s.redo();
      return true;
    case "delete":
      s.deleteSelection();
      return true;
    case "selectAll":
      s.selectAll();
      return true;
    case "clearSelection":
      s.clearSelection();
      return true;
    case "nudge":
      actions.nudge(action.dx, action.dy);
      return true;
    case "copy":
      if (s.copy()) s.showNotice("info", `Copied ${s.selection.nodes.length} component${s.selection.nodes.length === 1 ? "" : "s"}`);
      return true;
    case "cut":
      s.cut();
      return true;
    case "paste":
      s.paste();
      return true;
    case "duplicate":
      s.duplicate();
      return true;
    case "rename":
      if (s.selection.nodes.length === 1) s.startRename(s.selection.nodes[0]!);
      return true;
    case "help":
      opts.onOpenHelp();
      return true;
    case "fitView":
      actions.fitView();
      return true;
    case "zoomToSelection":
      actions.zoomToSelection();
      return true;
    case "toggleSnap":
      s.setSnapEnabled(!s.snapEnabled);
      s.showNotice("info", `Snap to grid ${s.snapEnabled ? "off" : "on"}`);
      return true;
    case "zoomIn":
      actions.zoomIn();
      return true;
    case "zoomOut":
      actions.zoomOut();
      return true;
    default:
      return false;
  }
}

/**
 * Canvas shortcuts. Active while focus is on the page body or inside the Studio, never while
 * typing in a field or while a dialog/menu owns focus.
 */
export function useStudioKeyboard({ readOnly, actions, onOpenHelp }: { readOnly: boolean; actions: StudioActions; onOpenHelp: () => void }) {
  const opts = useRef({ readOnly, actions, onOpenHelp });
  opts.current = { readOnly, actions, onOpenHelp };
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isEditableTarget(e.target)) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target && target !== document.body && !target.closest(".st-studio")) return;
      if (target?.closest('[role="dialog"], [role="menu"], .st-palette')) return;
      const action = resolveShortcut(e);
      if (!action) return;
      const { readOnly: ro, actions: a, onOpenHelp: help } = opts.current;
      if (runShortcut(action, a, { readOnly: ro, onOpenHelp: help })) {
        e.preventDefault();
        // Capture phase + stop: a focused xyflow node would otherwise also move itself on arrow
        // keys (outside our undo stack) or swallow the key.
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);
}
