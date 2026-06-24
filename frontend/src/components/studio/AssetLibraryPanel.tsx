import { useMemo } from "react";
import { useStore } from "../../store/useStore";
import { CommandInput } from "../ui/CommandInput";
import { IconButton } from "../ui/IconButton";
import {
  ASSET_CATEGORIES,
  DEMO_ASSET_TEMPLATES,
  filterTemplatesByQuery,
} from "./demoAssetTemplates";
import { ASSET_CATEGORY_LABELS } from "./studioTypes";
import { AssetTemplateCard } from "./AssetTemplateCard";

export function AssetLibraryPanel() {
  const {
    selectedAssetTypeId,
    setSelectedAssetTypeId,
    studioLibrarySearch,
    setStudioLibrarySearch,
    toggleLeftRail,
  } = useStore();

  const filtered = useMemo(
    () => filterTemplatesByQuery(DEMO_ASSET_TEMPLATES, studioLibrarySearch),
    [studioLibrarySearch],
  );

  return (
    <aside className="pl-studio-lib" aria-label="Asset library">
      <header className="pl-studio-lib__header">
        <h2 className="pl-studio-lib__title">Asset Library</h2>
        <IconButton label="Close library panel" onClick={toggleLeftRail}>
          <CloseIcon />
        </IconButton>
      </header>

      <CommandInput
        placeholder="Search assets…"
        value={studioLibrarySearch}
        onChange={(e) => setStudioLibrarySearch(e.target.value)}
        readOnlyHint={false}
        className="pl-studio-lib__search"
      />

      <nav className="pl-studio-lib__nav">
        {ASSET_CATEGORIES.map((category) => {
          const items = filtered.filter((t) => t.category === category);
          if (items.length === 0) return null;

          return (
            <section key={category} className="pl-studio-lib__category">
              <h3 className="pl-studio-lib__category-label">
                {ASSET_CATEGORY_LABELS[category].toUpperCase()}
              </h3>
              <ul className="pl-studio-lib__list">
                {items.map((template) => (
                  <li key={template.typeId}>
                    <AssetTemplateCard
                      template={template}
                      selected={selectedAssetTypeId === template.typeId}
                      onSelect={() => setSelectedAssetTypeId(template.typeId)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </nav>

      <span className="pl-scaffold-tag">Demo templates</span>
    </aside>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M5.5 4.5L10 9l4.5-4.5L15 5.5 10.5 10 15 14.5l-1.5 1.5L10 11.5 5.5 16 4 14.5 8.5 10 4 5.5z" />
    </svg>
  );
}