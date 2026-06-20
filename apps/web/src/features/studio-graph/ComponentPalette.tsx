import { useMemo, useState } from "react";
import { ComponentCard } from "./ComponentCard";
import {
  CATEGORY_LABELS,
  type ComponentCategory,
  type ComponentTemplate,
} from "./componentLibraryTypes";
import "./componentPalette.css";

const CATEGORY_ORDER: ComponentCategory[] = [
  "power_electrical",
  "actuation_mechanical",
  "process_physical",
  "sensors",
];

interface ComponentPaletteProps {
  components: ComponentTemplate[];
}

function matchesQuery(component: ComponentTemplate, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    component.display_name,
    component.component_type_id,
    component.category,
    component.description,
    ...component.tags,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function ComponentPalette({ components }: ComponentPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<ComponentCategory | "all">("all");

  const filtered = useMemo(() => {
    return components.filter((component) => {
      if (activeCategory !== "all" && component.category !== activeCategory) return false;
      return matchesQuery(component, query);
    });
  }, [components, query, activeCategory]);

  const grouped = useMemo(() => {
    const map = new Map<ComponentCategory, ComponentTemplate[]>();
    for (const component of filtered) {
      const list = map.get(component.category) ?? [];
      list.push(component);
      map.set(component.category, list);
    }
    return map;
  }, [filtered]);

  return (
    <section className="component-palette" aria-label="Component library palette">
      <header className="component-palette__toolbar">
        <input
          type="search"
          className="component-palette__search"
          placeholder="Search components by name, tag, or id…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search components"
        />
        <div className="component-palette__filters" role="group" aria-label="Category filters">
          <button
            type="button"
            className={activeCategory === "all" ? "active" : ""}
            onClick={() => setActiveCategory("all")}
          >
            All ({components.length})
          </button>
          {CATEGORY_ORDER.map((category) => {
            const count = components.filter((c) => c.category === category).length;
            return (
              <button
                key={category}
                type="button"
                className={activeCategory === category ? "active" : ""}
                onClick={() => setActiveCategory(category)}
              >
                {CATEGORY_LABELS[category]} ({count})
              </button>
            );
          })}
        </div>
      </header>

      <p className="component-palette__summary">
        Showing {filtered.length} of {components.length} components — palette preview only, no drag/drop yet.
      </p>

      {CATEGORY_ORDER.map((category) => {
        const items = grouped.get(category);
        if (!items?.length) return null;
        return (
          <section key={category} className="component-palette__group">
            <h2>{CATEGORY_LABELS[category]}</h2>
            <div className="component-palette__grid">
              {items.map((component) => (
                <ComponentCard key={component.component_type_id} component={component} />
              ))}
            </div>
          </section>
        );
      })}

      {filtered.length === 0 ? (
        <p className="component-palette__empty">No components match the current search.</p>
      ) : null}
    </section>
  );
}