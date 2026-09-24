/**
 * Component palette: searchable, grouped by category, keyboard operable.
 * Drag an item onto the canvas (HTML5 DnD, custom MIME) or press Enter / click to place it at the
 * viewport centre.
 */
import { ChevronDown, ChevronsLeft, ChevronsRight, Search } from "lucide-react";
import { memo, useMemo, useState, type DragEvent, type KeyboardEvent } from "react";
import { ComponentSymbol } from "./canvas/ComponentSymbol";
import { IconButton } from "../../components/ui/primitives";
import { MEDIUM_SHORT, isMedium, mediumColor } from "../connection-rules/media";
import { PALETTE_MIME } from "./canvas/dnd";
import { CATEGORY_LABELS, type ComponentCategory, type ComponentTemplate } from "./componentLibraryTypes";
import { portSummary } from "./model/portLayout";
import { useStudioStore } from "./studioStore";

const CATEGORY_ORDER: ComponentCategory[] = ["power_electrical", "actuation_mechanical", "process_physical", "sensors"];

export function matchesQuery(component: ComponentTemplate, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return q
    .split(/\s+/)
    .every((term) =>
      [component.display_name, component.component_type_id, component.category, component.description, ...component.tags, ...component.ports.map((p) => p.medium)]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
}

function uniqueMedia(component: ComponentTemplate): string[] {
  return [...new Set(component.ports.map((p) => p.medium))];
}

const PaletteItem = memo(function PaletteItem({
  component,
  disabled,
  onAdd,
}: {
  component: ComponentTemplate;
  disabled: boolean;
  onAdd: (id: string) => void;
}) {
  const onDragStart = (e: DragEvent<HTMLButtonElement>) => {
    e.dataTransfer.setData(PALETTE_MIME, component.component_type_id);
    e.dataTransfer.setData("text/plain", component.display_name);
    e.dataTransfer.effectAllowed = "copy";
    useStudioStore.getState().setDraggingTemplate(component.component_type_id);
  };
  return (
    <li>
      <button
        type="button"
        className="st-palette__item"
        draggable={!disabled}
        disabled={disabled}
        onDragStart={onDragStart}
        onDragEnd={() => useStudioStore.getState().setDraggingTemplate(null)}
        onClick={() => onAdd(component.component_type_id)}
        aria-label={`Add ${component.display_name} — ${portSummary(component.ports)}. Drag onto the canvas or press Enter.`}
        data-testid={`palette-${component.component_type_id}`}
      >
        <ComponentSymbol componentTypeId={component.component_type_id} size={30} />
        <span className="st-palette__text">
          <span className="st-palette__name">{component.display_name}</span>
          <span className="st-palette__ports">
            {portSummary(component.ports)}
            <span className="st-palette__media" aria-hidden>
              {uniqueMedia(component).map((m) => (
                <span key={m} className="st-palette__medium" style={{ ["--c" as string]: mediumColor(m) }} title={m}>
                  {isMedium(m) ? MEDIUM_SHORT[m] : m}
                </span>
              ))}
            </span>
          </span>
        </span>
      </button>
    </li>
  );
});

export function Palette({ components, readOnly, onAdd }: { components: ComponentTemplate[]; readOnly: boolean; onAdd: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const collapsed = useStudioStore((s) => s.paletteCollapsed);
  const setCollapsed = useStudioStore((s) => s.setPaletteCollapsed);

  const groups = useMemo(() => {
    const filtered = components.filter((c) => matchesQuery(c, query));
    const known = new Set<string>(CATEGORY_ORDER);
    const order = [...CATEGORY_ORDER, ...new Set(filtered.map((c) => c.category).filter((c) => !known.has(c)))];
    return order
      .map((category) => ({ category, items: filtered.filter((c) => c.category === category) }))
      .filter((g) => g.items.length);
  }, [components, query]);
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  // Arrow keys move between items (roving through the flat list of buttons).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>(".st-palette__item"));
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = items[Math.min(items.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)))];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  if (collapsed) {
    return (
      <aside className="st-palette st-palette--collapsed" aria-label="Component palette (collapsed)">
        <IconButton label="Show component palette" icon={<ChevronsRight />} onClick={() => setCollapsed(false)} />
      </aside>
    );
  }

  return (
    <aside className="st-palette" aria-label="Component palette">
      <div className="st-palette__head">
        <h2 className="st-panel-title">Components</h2>
        <IconButton label="Hide palette" icon={<ChevronsLeft />} size="sm" onClick={() => setCollapsed(true)} />
      </div>
      <label className="st-palette__search">
        <Search aria-hidden />
        <input
          type="search"
          className="pl-input"
          placeholder="Search name, tag, medium…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search components"
          onKeyDown={(e) => {
            if (e.key === "Enter" && groups[0]?.items[0] && !readOnly) onAdd(groups[0].items[0].component_type_id);
          }}
        />
      </label>
      <p className="st-palette__hint">{readOnly ? "Read-only: your role cannot edit the assembly." : "Drag onto the canvas, or press Enter to place in the centre."}</p>
      <div className="st-palette__list" onKeyDown={onKeyDown}>
        {groups.map(({ category, items }) => {
          const isClosed = closed[category] && !query;
          return (
            <section key={category} className="st-palette__group">
              <button
                type="button"
                className="st-palette__group-head"
                aria-expanded={!isClosed}
                onClick={() => setClosed((c) => ({ ...c, [category]: !c[category] }))}
              >
                <ChevronDown aria-hidden data-closed={isClosed || undefined} />
                <span>{CATEGORY_LABELS[category as ComponentCategory] ?? category}</span>
                <span className="st-palette__count">{items.length}</span>
              </button>
              {!isClosed ? (
                <ul className="st-palette__items">
                  {items.map((c) => (
                    <PaletteItem key={c.component_type_id} component={c} disabled={readOnly} onAdd={onAdd} />
                  ))}
                </ul>
              ) : null}
            </section>
          );
        })}
        {total === 0 ? <p className="st-palette__empty">No component matches “{query}”.</p> : null}
      </div>
    </aside>
  );
}
