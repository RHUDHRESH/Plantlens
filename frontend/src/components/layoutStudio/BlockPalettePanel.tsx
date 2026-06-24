import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useMemo } from "react";
import { useStore } from "../../store/useStore";
import { DEMO_PALETTE_ITEMS } from "./demoLayoutData";
import type { BlockPaletteItem } from "./layoutStudioTypes";
import { CommandInput } from "../ui/CommandInput";

const CATEGORY_ORDER = ["motors", "air", "power", "sensors", "control", "groups"] as const;

const CATEGORY_LABELS: Record<(typeof CATEGORY_ORDER)[number], string> = {
  motors: "Motors",
  air: "Air",
  power: "Power",
  sensors: "Sensors",
  control: "Control",
  groups: "Groups",
};

function PaletteDraggableItem({
  item,
  editable,
}: {
  item: BlockPaletteItem;
  editable: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette-${item.id}`,
    data: { type: "palette", item },
    disabled: !editable,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li ref={setNodeRef} style={style} className="pl-layout-palette__item-wrap">
      <div
        className={[
          "pl-layout-palette__item",
          isDragging ? "pl-layout-palette__item--dragging" : "",
          !editable ? "pl-layout-palette__item--readonly" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        {...(editable ? listeners : {})}
        {...(editable ? attributes : {})}
      >
        <span className="pl-layout-palette__drag" aria-hidden="true">
          ⠿
        </span>
        <div className="pl-layout-palette__item-body">
          <span className="pl-layout-palette__item-label">{item.label}</span>
          <span className="pl-layout-palette__item-meta">{item.typeId}</span>
          <span className="pl-layout-palette__item-geo">{item.geometryRef}</span>
          <span className="pl-layout-palette__item-desc">{item.description}</span>
        </div>
        {editable && (
          <PaletteAddButton itemId={item.id} label={item.label} />
        )}
      </div>
    </li>
  );
}

function PaletteAddButton({ itemId, label }: { itemId: string; label: string }) {
  const addBlockFromPalette = useStore((s) => s.addBlockFromPalette);

  return (
    <button
      type="button"
      className="pl-layout-palette__add"
      onClick={(e) => {
        e.stopPropagation();
        addBlockFromPalette(itemId);
      }}
      aria-label={`Add ${label} to canvas`}
      title="Add at default position"
    >
      + Add
    </button>
  );
}

export function BlockPalettePanel() {
  const { layoutPaletteSearch, setLayoutPaletteSearch, role } = useStore();
  const editable = role === "engineer";

  const filtered = useMemo(() => {
    const q = layoutPaletteSearch.trim().toLowerCase();
    if (!q) return DEMO_PALETTE_ITEMS;
    return DEMO_PALETTE_ITEMS.filter(
      (p) =>
        p.label.toLowerCase().includes(q) ||
        p.typeId.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q),
    );
  }, [layoutPaletteSearch]);

  const byCategory = useMemo(() => {
    const map = new Map<string, BlockPaletteItem[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const item of filtered) {
      map.get(item.category)?.push(item);
    }
    return map;
  }, [filtered]);

  return (
    <aside className="pl-layout-palette" aria-label="Block palette">
      <header className="pl-layout-palette__header">
        <h2 className="pl-layout-palette__title">Block Palette</h2>
      </header>

      <CommandInput
        placeholder="Search block…"
        value={layoutPaletteSearch}
        onChange={(e) => setLayoutPaletteSearch(e.target.value)}
        className="pl-layout-palette__search"
        readOnlyHint={!editable}
      />

      <div className="pl-layout-palette__categories">
        {CATEGORY_ORDER.map((cat) => {
          const items = byCategory.get(cat) ?? [];
          if (items.length === 0) return null;
          return (
            <section key={cat} className="pl-layout-palette__category">
              <h3 className="pl-layout-palette__category-label">{CATEGORY_LABELS[cat]}</h3>
              <ul className="pl-layout-palette__list">
                {items.map((item) => (
                  <PaletteDraggableItem key={item.id} item={item} editable={editable} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {!editable && (
        <p className="pl-layout-palette__readonly">Palette drag disabled — view only.</p>
      )}
    </aside>
  );
}