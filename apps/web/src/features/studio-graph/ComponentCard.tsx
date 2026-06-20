import { ComponentIcon } from "./ComponentIcon";
import type { ComponentTemplate } from "./componentLibraryTypes";

interface ComponentCardProps {
  component: ComponentTemplate;
  onAdd?: (() => void) | undefined;
}

export function ComponentCard({ component, onAdd }: ComponentCardProps) {
  const { visual_asset: visual } = component;
  const hasSafety = component.safety_notes.length > 0;

  return (
    <article className="component-card" data-component-id={component.component_type_id}>
      <header className="component-card__header">
        <ComponentIcon
          svg={visual.icon_svg}
          label={visual.preview_label}
          accentRole={visual.accent_role}
          size={52}
        />
        <div className="component-card__titles">
          <h3>{component.display_name}</h3>
          <p className="component-card__id">{component.component_type_id}</p>
        </div>
        {hasSafety ? <span className="component-card__safety-badge">Safety</span> : null}
      </header>
      <p className="component-card__description">{component.description}</p>
      <dl className="component-card__stats">
        <div>
          <dt>Ports</dt>
          <dd>{component.ports.length}</dd>
        </div>
        <div>
          <dt>Signals</dt>
          <dd>{component.signal_templates.length}</dd>
        </div>
        <div>
          <dt>Faults</dt>
          <dd>{component.fault_modes.length}</dd>
        </div>
        <div>
          <dt>Sensors</dt>
          <dd>{component.recommended_sensors.length}</dd>
        </div>
      </dl>
      {component.tags.length > 0 ? (
        <ul className="component-card__tags">
          {component.tags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      ) : null}
      {onAdd ? (
        <button type="button" className="component-card__add" onClick={onAdd}>
          Add to canvas
        </button>
      ) : null}
    </article>
  );
}