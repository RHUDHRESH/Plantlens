import { useStore } from "../../store/useStore";
import { DEMO_COMPILER_SUMMARY, DEMO_SOURCE_FILES } from "./demoHmiCompilerData";
import { HmiPreviewCanvas } from "./HmiPreviewCanvas";
import { CompilerValidationPanel } from "./CompilerValidationPanel";
import { getWidgetsForScreen } from "./demoHmiCompilerData";
import { Panel } from "../ui/Panel";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";

function statusMarker(status: string): string {
  switch (status) {
    case "valid":
    case "bound":
      return "✓";
    case "warning":
      return "!";
    case "missing":
      return "×";
    default:
      return "○";
  }
}

export function MobileHmiPreviewView() {
  const {
    hmiRoleTarget,
    hmiDeviceTarget,
    selectedGeneratedScreenId,
    hmiValidationItems,
    hmiValidationStatus,
    regenerateHmiPreview,
    goBackToPlantLayout,
  } = useStore();

  const widgets = getWidgetsForScreen(selectedGeneratedScreenId);
  const canExport = hmiValidationStatus === "valid" || hmiValidationStatus === "warning";

  return (
    <div className="pl-mobile-hmi">
      <header className="pl-mobile-hmi__header">
        <span className="pl-label">HMI Preview</span>
        <h1 className="pl-mobile-hmi__title">
          {hmiRoleTarget} / {hmiDeviceTarget}
        </h1>
        <div className="pl-mobile-hmi__badges">
          <Badge variant="info">GENERATED PREVIEW</Badge>
          <Badge variant="readonly">DRAFT ONLY</Badge>
        </div>
      </header>

      <Panel title="Generated screen" variant="light" padding="sm">
        <HmiPreviewCanvas />
      </Panel>

      <Panel title="Generated from" variant="light">
        <ul className="pl-mobile-hmi__source-list">
          {DEMO_SOURCE_FILES.slice(0, 5).map((f) => (
            <li key={f.id}>
              <code>{f.filename}</code>
              <span aria-hidden="true">{statusMarker(f.status)}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Widgets" variant="light">
        <ul className="pl-mobile-hmi__widget-list">
          {widgets.map((w) => (
            <li key={w.id}>
              <div className="pl-mobile-hmi__widget-row">
                <strong>{w.widget}</strong>
                <span>{w.boundTo}</span>
              </div>
              <span className="pl-mobile-hmi__widget-reason">{w.reason}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Validation" variant="light">
        <CompilerValidationPanel
          items={hmiValidationItems}
          summary={DEMO_COMPILER_SUMMARY}
          compact
        />
      </Panel>

      <div className="pl-mobile-hmi__actions">
        <Button variant="secondary" size="lg" fullWidth onClick={regenerateHmiPreview}>
          Regenerate
        </Button>
        <Button variant="secondary" size="lg" fullWidth onClick={goBackToPlantLayout}>
          Back Layout
        </Button>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={!canExport}
          title="Export review draft only — no runtime deployment"
          onClick={() => {
            /* scaffold — no backend write */
          }}
        >
          Export Draft
        </Button>
      </div>
    </div>
  );
}