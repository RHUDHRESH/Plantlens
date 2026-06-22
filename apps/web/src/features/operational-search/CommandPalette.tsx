import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import type { OperationalSearchResult } from "./searchTypes";

const KIND_LABELS: Record<string, string> = {
  asset: "Asset",
  tag: "Tag",
  alarm: "Alarm",
  causal_step: "Causal",
  command: "Command",
};

export interface CommandPaletteProps {
  open: boolean;
  query: string;
  activeIndex: number;
  results: OperationalSearchResult[];
  onQueryChange: (query: string) => void;
  onClose: () => void;
  onMoveActive: (delta: number) => void;
  onExecuteResult: (result: OperationalSearchResult) => void;
  onSetActiveIndex: (index: number) => void;
}

export function CommandPalette({
  open,
  query,
  activeIndex,
  results,
  onQueryChange,
  onClose,
  onMoveActive,
  onExecuteResult,
  onSetActiveIndex,
}: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [open]);

  if (!open) return null;

  const activeId = results[activeIndex] ? `${listboxId}-opt-${activeIndex}` : undefined;

  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      onMoveActive(1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      onMoveActive(-1);
      return;
    }
    if (e.key === "Enter" && results[activeIndex]) {
      e.preventDefault();
      onExecuteResult(results[activeIndex]!);
    }
  };

  return (
    <div className="command-palette" role="presentation">
      <button
        type="button"
        className="command-palette__backdrop"
        aria-label="Close search palette"
        onClick={onClose}
      />
      <div className="command-palette__panel" role="dialog" aria-label="Operational search">
        <label className="command-palette__label" htmlFor={`${listboxId}-input`}>
          Search assets, alarms, tags, commands
        </label>
        <input
          ref={inputRef}
          id={`${listboxId}-input`}
          type="search"
          className="command-palette__input"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={listboxId}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          placeholder="Search…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleInputKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
        <p className="command-palette__hint">↑↓ navigate · Enter run · Esc close · Ctrl K</p>
        <ul
          id={listboxId}
          className="command-palette__results"
          role="listbox"
          aria-label="Search results"
        >
          {results.length === 0 ? (
            <li className="command-palette__empty" role="presentation">
              No matching results
            </li>
          ) : (
            results.map((result, index) => {
              const isActive = index === activeIndex;
              return (
                <li
                  key={result.document.id}
                  id={`${listboxId}-opt-${index}`}
                  role="option"
                  aria-selected={isActive}
                  className={`command-palette__option${isActive ? " command-palette__option--active" : ""}`}
                  onMouseEnter={() => onSetActiveIndex(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onExecuteResult(result)}
                >
                  <span className="command-palette__kind">{KIND_LABELS[result.document.kind] ?? result.document.kind}</span>
                  <span className="command-palette__title">{result.document.title}</span>
                  <span className="command-palette__subtitle">{result.document.subtitle}</span>
                  <span className="command-palette__reason">{result.reason}</span>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}