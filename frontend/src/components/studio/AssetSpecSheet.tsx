import { Badge } from "../ui/Badge";
import { getDemoAsset } from "../../data/demoPlant";
import type { AssetTemplate } from "./studioTypes";
import { ParameterTable } from "./ParameterTable";
import { DerivedRulesPanel } from "./DerivedRulesPanel";
import { SignalBindingsPanel } from "./SignalBindingsPanel";
import { FaultModePanel } from "./FaultModePanel";

interface AssetSpecSheetProps {
  template: AssetTemplate;
  instanceId: string | null;
  draftValues: Record<string, number | string>;
  editable: boolean;
  dirty: boolean;
  parameterSearch: string;
  onParameterChange: (key: string, value: number | string) => void;
}

export function AssetSpecSheet({
  template,
  instanceId,
  draftValues,
  editable,
  dirty,
  parameterSearch,
  onParameterChange,
}: AssetSpecSheetProps) {
  const instance = instanceId ? getDemoAsset(instanceId) : undefined;
  const subtitle = instance
    ? `${instance.id} / ${instance.location}`
    : "Template only — no instance bound";

  return (
    <main className="pl-studio-spec" aria-label="Asset spec sheet">
      <header className="pl-studio-spec__header">
        <div className="pl-studio-spec__titles">
          <span className="pl-label">Asset Spec Sheet</span>
          <h1 className="pl-studio-spec__title">{template.label}</h1>
          <p className="pl-studio-spec__subtitle">{subtitle}</p>
        </div>
        <div className="pl-studio-spec__badges">
          <Badge variant={editable ? "info" : "readonly"}>
            {editable ? "Model editing" : "View only"}
          </Badge>
          {dirty && <Badge variant="warning">Draft dirty</Badge>}
          <span className="pl-scaffold-tag">Demo fallback</span>
        </div>
      </header>

      <ParameterTable
        parameters={template.parameters}
        draftValues={draftValues}
        editable={editable}
        searchQuery={parameterSearch}
        onChange={onParameterChange}
      />

      <DerivedRulesPanel template={template} draftValues={draftValues} />
      <SignalBindingsPanel signals={template.signals} />
      <FaultModePanel faultModes={template.faultModes} />
    </main>
  );
}