import { useStore } from "../../store/useStore";
import type { HmiVariant } from "./hmiCompilerTypes";

const VARIANTS: { id: HmiVariant; label: string }[] = [
  { id: "normal", label: "Normal" },
  { id: "warning", label: "Warning" },
  { id: "degraded", label: "Degraded" },
  { id: "offline", label: "Offline" },
];

export function VariantSelector() {
  const { hmiVariant, setHmiVariant } = useStore();

  return (
    <fieldset className="pl-hmi-selector">
      <legend className="pl-hmi-selector__legend">Variants</legend>
      <div className="pl-hmi-selector__options" role="radiogroup" aria-label="HMI state variant">
        {VARIANTS.map((variant) => (
          <button
            key={variant.id}
            type="button"
            role="radio"
            aria-checked={hmiVariant === variant.id}
            className={[
              "pl-hmi-selector__option",
              hmiVariant === variant.id ? "pl-hmi-selector__option--active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => setHmiVariant(variant.id)}
          >
            <span className="pl-hmi-selector__marker" aria-hidden="true">
              {hmiVariant === variant.id ? "●" : "○"}
            </span>
            {variant.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}