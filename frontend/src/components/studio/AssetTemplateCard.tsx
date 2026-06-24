import type { AssetTemplate } from "./studioTypes";

interface AssetTemplateCardProps {
  template: AssetTemplate;
  selected: boolean;
  onSelect: () => void;
}

export function AssetTemplateCard({ template, selected, onSelect }: AssetTemplateCardProps) {
  return (
    <button
      type="button"
      className={`pl-studio-lib__item ${selected ? "pl-studio-lib__item--selected" : ""}`}
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
    >
      <span className="pl-studio-lib__marker" aria-hidden="true">
        {selected ? "●" : "○"}
      </span>
      <span className="pl-studio-lib__item-label">{template.label}</span>
    </button>
  );
}