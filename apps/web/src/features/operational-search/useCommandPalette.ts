import { useCallback, useEffect, useRef, useState } from "react";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

export interface UseCommandPaletteReturn {
  open: boolean;
  query: string;
  activeIndex: number;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
  setQuery: (query: string) => void;
  moveActive: (delta: number, resultCount: number) => void;
  setActiveIndex: (index: number) => void;
  reset: () => void;
}

export function useCommandPalette(): UseCommandPaletteReturn {
  const [open, setOpen] = useState(false);
  const [query, setQueryState] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const openPalette = useCallback(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
    setActiveIndex(0);
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
    setQueryState("");
    setActiveIndex(0);
    const prev = previousFocusRef.current;
    if (prev && document.contains(prev)) {
      prev.focus();
    }
    previousFocusRef.current = null;
  }, []);

  const togglePalette = useCallback(() => {
    if (open) closePalette();
    else openPalette();
  }, [open, closePalette, openPalette]);

  const setQuery = useCallback((next: string) => {
    setQueryState(next);
    setActiveIndex(0);
  }, []);

  const moveActive = useCallback((delta: number, resultCount: number) => {
    if (resultCount <= 0) return;
    setActiveIndex((idx) => {
      const next = idx + delta;
      if (next < 0) return resultCount - 1;
      if (next >= resultCount) return 0;
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setQueryState("");
    setActiveIndex(0);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        togglePalette();
        return;
      }
      if (e.key === "/" && !isEditableTarget(e.target) && !open) {
        e.preventDefault();
        openPalette();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePalette, openPalette, open]);

  return {
    open,
    query,
    activeIndex,
    openPalette,
    closePalette,
    togglePalette,
    setQuery,
    moveActive,
    setActiveIndex,
    reset,
  };
}