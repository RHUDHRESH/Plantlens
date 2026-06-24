import { useStore } from "../../store/useStore";
import { DEMO_COMPILER_SUMMARY } from "./demoHmiCompilerData";
import { SourceModelList } from "./SourceModelList";
import { CompilerValidationPanel } from "./CompilerValidationPanel";
import { Badge } from "../ui/Badge";

export function CompilerInspectorPanel() {
  const { hmiValidationStatus, hmiValidationItems } = useStore();

  return (
    <aside className="pl-hmi-inspector" aria-label="Compiler inspector">
      <header className="pl-hmi-inspector__header">
        <h2 className="pl-hmi-inspector__title">Compiler Inspector</h2>
      </header>

      <SourceModelList />

      <section className="pl-hmi-inspector__section">
        <h3 className="pl-hmi-inspector__label">Generated</h3>
        <dl className="pl-hmi-inspector__stats">
          <div>
            <dt>Screens</dt>
            <dd>{DEMO_COMPILER_SUMMARY.screensGenerated}</dd>
          </div>
          <div>
            <dt>Widgets</dt>
            <dd>{DEMO_COMPILER_SUMMARY.widgetsGenerated}</dd>
          </div>
          <div>
            <dt>Bindings</dt>
            <dd>{DEMO_COMPILER_SUMMARY.bindingsCreated}</dd>
          </div>
          <div>
            <dt>Roles</dt>
            <dd>{DEMO_COMPILER_SUMMARY.roleVariants}</dd>
          </div>
        </dl>
      </section>

      <CompilerValidationPanel
        items={hmiValidationItems}
        summary={DEMO_COMPILER_SUMMARY}
      />

      <section className="pl-hmi-inspector__section">
        <h3 className="pl-hmi-inspector__label">Output</h3>
        <div className="pl-hmi-inspector__badges">
          <Badge variant="warning">Draft only</Badge>
          <Badge variant="readonly">No runtime deploy</Badge>
          <Badge
            variant={
              hmiValidationStatus === "valid"
                ? "success"
                : hmiValidationStatus === "warning"
                  ? "warning"
                  : "unknown"
            }
          >
            {hmiValidationStatus}
          </Badge>
        </div>
      </section>

      <footer className="pl-hmi-inspector__footer">
        <p>Requires approval before runtime use.</p>
        <p>Draft layout only. No plant write path.</p>
      </footer>
    </aside>
  );
}