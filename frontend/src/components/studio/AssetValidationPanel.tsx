import type { ValidationItem } from "./studioTypes";

interface AssetValidationPanelProps {
  items: ValidationItem[];
  compact?: boolean;
}

const levelMarker: Record<ValidationItem["level"], string> = {
  valid: "✓",
  warning: "!",
  error: "×",
};

const levelClass: Record<ValidationItem["level"], string> = {
  valid: "pl-studio-validation__item--valid",
  warning: "pl-studio-validation__item--warning",
  error: "pl-studio-validation__item--error",
};

export function AssetValidationPanel({ items, compact = false }: AssetValidationPanelProps) {
  return (
    <section
      className={`pl-studio-validation ${compact ? "pl-studio-validation--compact" : ""}`}
      aria-label="Model draft validation"
    >
      <span className="pl-label">Validation</span>
      <ul className="pl-studio-validation__list">
        {items.map((item) => (
          <li
            key={item.id}
            className={`pl-studio-validation__item ${levelClass[item.level]}`}
          >
            <span className="pl-studio-validation__marker" aria-hidden="true">
              {levelMarker[item.level]}
            </span>
            <span className="pl-studio-validation__label">{item.label}</span>
            {item.detail && !compact && (
              <span className="pl-studio-validation__detail">{item.detail}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="pl-studio-validation__disclaimer">
        Validation only checks model draft. It does not control equipment.
      </p>
    </section>
  );
}