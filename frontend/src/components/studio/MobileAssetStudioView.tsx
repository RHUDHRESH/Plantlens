import { Panel } from "../ui/Panel";
import { Badge } from "../ui/Badge";
import { getDemoAsset } from "../../data/demoPlant";
import { computeDerivedThresholds } from "./demoAssetTemplates";
import type { AssetTemplate, ValidationItem } from "./studioTypes";
import { AssetValidationPanel } from "./AssetValidationPanel";
import { Button } from "../ui/Button";

interface MobileAssetStudioViewProps {
  template: AssetTemplate;
  instanceId: string | null;
  draftValues: Record<string, number | string>;
  editable: boolean;
  validationItems: ValidationItem[];
  onValidate: () => void;
  onSubmit: () => void;
  canSubmit: boolean;
}

export function MobileAssetStudioView({
  template,
  instanceId,
  draftValues,
  editable,
  validationItems,
  onValidate,
  onSubmit,
  canSubmit,
}: MobileAssetStudioViewProps) {
  const instance = instanceId ? getDemoAsset(instanceId) : undefined;
  const thresholds = computeDerivedThresholds(template, draftValues);
  const engineerParams = template.parameters.filter((p) => p.visibility === "engineer");

  return (
    <div className="pl-mobile-studio">
      <header className="pl-mobile-studio__header">
        <span className="pl-label">Studio</span>
        <h1 className="pl-mobile-studio__title">{template.label}</h1>
        <Badge variant={editable ? "info" : "readonly"}>
          {editable ? "Engineer" : "View only"}
        </Badge>
      </header>

      <Panel title="Asset template" variant="light">
        <p className="pl-mobile-studio__meta">{template.typeId}</p>
        <p className="pl-mobile-studio__meta">geometry: {template.geometryRef}</p>
        {instance && (
          <p className="pl-mobile-studio__meta">{instance.id} / {instance.location}</p>
        )}
      </Panel>

      <Panel title="Preview" variant="light">
        <div className="pl-mobile-studio__preview-box">
          <MobileSchematic assetClass={template.assetClass} label={template.label} />
        </div>
      </Panel>

      <Panel title="Parameters" variant="light">
        <ul className="pl-mobile-studio__param-list">
          {engineerParams.map((p) => (
            <li key={p.key} className="pl-mobile-studio__param">
              <span className="pl-mobile-studio__param-name">{p.label}</span>
              <span className="pl-mobile-studio__param-val">
                {draftValues[p.key] ?? p.value} {p.unit ?? ""}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Derived thresholds" variant="light">
        <ul className="pl-mobile-studio__threshold-list">
          {thresholds.map((t) => (
            <li key={t.key}>
              {t.label} = {t.value}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Fault modes" variant="light">
        <ul className="pl-mobile-studio__fault-list">
          {template.faultModes.map((f) => (
            <li key={f.id}>{f.label}</li>
          ))}
        </ul>
      </Panel>

      <Panel title="Validation" variant="light" padding="sm">
        <AssetValidationPanel items={validationItems} compact />
      </Panel>

      <div className="pl-mobile-studio__actions">
        <Button variant="secondary" size="lg" fullWidth onClick={onValidate}>
          Validate
        </Button>
        <Button variant="ghost" size="lg" fullWidth disabled>
          Preview HMI
        </Button>
        <Button variant="primary" size="lg" fullWidth disabled={!canSubmit} onClick={onSubmit}>
          Submit Approval
        </Button>
      </div>
    </div>
  );
}

function MobileSchematic({ assetClass, label }: { assetClass: string; label: string }) {
  if (assetClass === "motor") {
    return (
      <div className="pl-mobile-studio__motor">
        <div className="pl-mobile-studio__motor-body">MOTOR</div>
        <div className="pl-mobile-studio__motor-shaft">shaft ───</div>
      </div>
    );
  }
  return <div className="pl-mobile-studio__generic">{label}</div>;
}