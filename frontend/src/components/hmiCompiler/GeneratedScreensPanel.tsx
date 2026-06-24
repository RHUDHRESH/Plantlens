import { useStore } from "../../store/useStore";
import { DEMO_GENERATED_SCREENS } from "./demoHmiCompilerData";
import { RoleTargetSelector } from "./RoleTargetSelector";
import { DeviceTargetSelector } from "./DeviceTargetSelector";
import { VariantSelector } from "./VariantSelector";

export function GeneratedScreensPanel() {
  const { selectedGeneratedScreenId, setSelectedGeneratedScreenId } = useStore();

  return (
    <aside className="pl-hmi-screens-panel" aria-label="Generated screens">
      <header className="pl-hmi-screens-panel__header">
        <h2 className="pl-hmi-screens-panel__title">Generated Screens</h2>
      </header>

      <ul className="pl-hmi-screens-panel__list">
        {DEMO_GENERATED_SCREENS.map((screen) => {
          const selected = screen.id === selectedGeneratedScreenId;
          return (
            <li key={screen.id}>
              <button
                type="button"
                className={[
                  "pl-hmi-screens-panel__item",
                  selected ? "pl-hmi-screens-panel__item--selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setSelectedGeneratedScreenId(screen.id)}
                aria-pressed={selected}
              >
                <span className="pl-hmi-screens-panel__marker" aria-hidden="true">
                  {selected ? "●" : "○"}
                </span>
                <span className="pl-hmi-screens-panel__label">{screen.label}</span>
                <span className="pl-hmi-screens-panel__meta">
                  {screen.widgetCount}w · {screen.bindingCount}b
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <RoleTargetSelector />
      <DeviceTargetSelector />
      <VariantSelector />
    </aside>
  );
}