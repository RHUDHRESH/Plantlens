import type { Situation } from "../../store/useStore";
import type { DagGraphMeta } from "./dagTypes";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";
import { useStore } from "../../store/useStore";

interface MobileDagPathViewProps {
  situation: Situation;
  meta: DagGraphMeta;
  title: string;
}

export function MobileDagPathView({ situation, meta, title }: MobileDagPathViewProps) {
  const goBackToEvidence = useStore((s) => s.goBackToEvidence);
  const goBackToMap = useStore((s) => s.goBackToMap);

  return (
    <div className="pl-mobile-dag">
      <header className="pl-mobile-dag__header">
        <Badge variant="readonly">Read-only</Badge>
        <Badge variant="info">Engineer DAG path</Badge>
        <h1 className="pl-mobile-dag__title">{title}</h1>
        <p className="pl-mobile-dag__stats">
          Conf {(situation.confidence * 100).toFixed(0)}% · Cov{" "}
          {(situation.coverage * 100).toFixed(0)}%
        </p>
        {meta.isDemoFallback && (
          <span className="pl-scaffold-tag">Demo fallback data</span>
        )}
      </header>

      <Panel variant="light" title="Causal path">
        <ol className="pl-mobile-dag__path" role="list">
          {meta.mobilePath.map((step, idx) => (
            <li key={step.id} className="pl-mobile-dag__step">
              <div className="pl-mobile-dag__card">
                <span className="pl-label">{step.kind.toUpperCase()}</span>
                <span className="pl-mobile-dag__step-label">{step.label}</span>
                {step.expectedWindow && (
                  <span className="pl-mobile-dag__window">{step.expectedWindow}</span>
                )}
                {step.observedDelay && (
                  <span className="pl-mobile-dag__observed">{step.observedDelay}</span>
                )}
              </div>
              {idx < meta.mobilePath.length - 1 && (
                <span className="pl-mobile-dag__arrow" aria-hidden="true">
                  ↓
                </span>
              )}
            </li>
          ))}
        </ol>
      </Panel>

      <Panel variant="light" title="Missing / weak">
        <div className="pl-mobile-dag__missing">
          <span className="pl-evidence-row__marker">?</span>
          <div>
            <strong>{meta.mobileMissing.label}</strong>
            <p>{meta.mobileMissing.note}</p>
          </div>
        </div>
      </Panel>

      <Panel title="Action guidance">
        <p>{meta.mobileActionGuidance}</p>
        <Badge variant="readonly">No plant control</Badge>
      </Panel>

      <div className="pl-mobile-dag__nav">
        <Button variant="secondary" size="md" fullWidth onClick={goBackToEvidence}>
          Back Evidence
        </Button>
        <Button variant="primary" size="md" fullWidth onClick={goBackToMap}>
          Back Map
        </Button>
      </div>
    </div>
  );
}