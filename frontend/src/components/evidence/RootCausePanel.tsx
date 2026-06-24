import { Metric } from "../ui/Metric";
import { Panel } from "../ui/Panel";

interface RootCausePanelProps {
  rootCause: string;
  consequence: string;
  confidence: number;
  coverage: number;
}

export function RootCausePanel({
  rootCause,
  consequence,
  confidence,
  coverage,
}: RootCausePanelProps) {
  return (
    <Panel variant="light" title="Root cause" className="pl-root-cause">
      <p className="pl-root-cause__statement">{rootCause}</p>
      <p className="pl-root-cause__consequence">{consequence}</p>
      <footer className="pl-root-cause__footer">
        <Metric label="Confidence" value={`${(confidence * 100).toFixed(0)}%`} size="sm" />
        <Metric label="Coverage" value={`${(coverage * 100).toFixed(0)}%`} size="sm" />
      </footer>
    </Panel>
  );
}