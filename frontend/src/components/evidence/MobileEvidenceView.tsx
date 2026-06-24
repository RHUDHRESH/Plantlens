import type { Situation } from "../../store/useStore";
import type { EvidenceRoomData } from "../../types/evidence";
import { getSituationMeta } from "../../data/demoPlant";
import { Badge } from "../ui/Badge";
import { Metric } from "../ui/Metric";
import { RootCausePanel } from "./RootCausePanel";
import { EvidenceRow } from "./EvidenceRow";
import { CausalPathPanel } from "./CausalPathPanel";
import { ActionEnvelopePanel } from "./ActionEnvelopePanel";
import { MissingEvidencePanel } from "./MissingEvidencePanel";
import { ContradictionPanel } from "./ContradictionPanel";
import { Panel } from "../ui/Panel";

interface MobileEvidenceViewProps {
  situation: Situation;
  evidence: EvidenceRoomData;
}

export function MobileEvidenceView({ situation, evidence }: MobileEvidenceViewProps) {
  const meta = getSituationMeta(situation.id);

  return (
    <div className="pl-mobile-evidence">
      <header className="pl-mobile-evidence__header">
        <h1 className="pl-mobile-evidence__title">{situation.primary_fault}</h1>
        <p className="pl-mobile-evidence__location">{meta?.location ?? "—"}</p>
        <div className="pl-mobile-evidence__badges">
          <Badge variant="readonly">Read-only</Badge>
          <Badge variant={meta?.severity === "unknown" ? "unknown" : "warning"}>
            {meta?.severity ?? "warning"}
          </Badge>
        </div>
        <div className="pl-mobile-evidence__metrics">
          <Metric label="Conf" value={`${(situation.confidence * 100).toFixed(0)}%`} size="sm" />
          <Metric label="Cov" value={`${(situation.coverage * 100).toFixed(0)}%`} size="sm" />
        </div>
        {evidence.isDemoFallback && (
          <span className="pl-scaffold-tag">Demo fallback data</span>
        )}
      </header>

      <RootCausePanel
        rootCause={evidence.rootCause}
        consequence={evidence.consequence}
        confidence={situation.confidence}
        coverage={situation.coverage}
      />

      <Panel variant="light" title="Evidence">
        <div className="pl-mobile-evidence__list">
          {evidence.evidence.map((item) => (
            <EvidenceRow key={item.id} item={item} variant="card" />
          ))}
        </div>
      </Panel>

      <ContradictionPanel items={evidence.contradictions} />
      <MissingEvidencePanel items={evidence.missingItems} />
      <CausalPathPanel steps={evidence.causalPath} layout="vertical" />
      <ActionEnvelopePanel envelope={evidence.actionEnvelope} />
    </div>
  );
}