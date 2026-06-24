import { useStore } from "../store/useStore";
import { resolveEvidenceRoomData } from "../data/demoEvidence";
import { getSituationMeta } from "../data/demoPlant";
import { AppShell } from "../components/shell/AppShell";
import { TopStatusBar } from "../components/shell/TopStatusBar";
import { MobileBottomNav } from "../components/shell/MobileBottomNav";
import { Copilot } from "../copilot/Copilot";
import { Badge } from "../components/ui/Badge";
import { Metric } from "../components/ui/Metric";
import { SituationTimelineRail } from "../components/evidence/SituationTimelineRail";
import { RootCausePanel } from "../components/evidence/RootCausePanel";
import { EvidenceTable } from "../components/evidence/EvidenceTable";
import { ContradictionPanel } from "../components/evidence/ContradictionPanel";
import { MissingEvidencePanel } from "../components/evidence/MissingEvidencePanel";
import { CausalPathPanel } from "../components/evidence/CausalPathPanel";
import { ActionEnvelopePanel } from "../components/evidence/ActionEnvelopePanel";
import { EvidenceCommandBar } from "../components/evidence/EvidenceCommandBar";
import { MobileEvidenceView } from "../components/evidence/MobileEvidenceView";

export function SituationEvidenceRoom() {
  const {
    situations,
    selectedSituationId,
    setSelectedSituation,
    leftRailOpen,
    rightPanelOpen,
    openEvidenceRoom,
  } = useStore();

  const fallbackId = situations[0]?.id ?? "sit-motor-overload";
  const situation =
    situations.find((s) => s.id === selectedSituationId) ?? situations[0] ?? null;

  if (!situation) {
    return (
      <div className="pl-evidence-room pl-evidence-room--empty">
        <p>No active situation.</p>
      </div>
    );
  }

  const evidence = resolveEvidenceRoomData(situation.id, fallbackId);
  const meta = getSituationMeta(situation.id);

  const handleSelectSituation = (id: string) => {
    setSelectedSituation(id);
    openEvidenceRoom(id);
  };

  return (
    <AppShell
      top={<TopStatusBar />}
      left={
        leftRailOpen ? (
          <SituationTimelineRail
            situations={situations}
            selectedId={situation.id}
            evidence={evidence}
            onSelectSituation={handleSelectSituation}
          />
        ) : null
      }
      right={rightPanelOpen ? <ActionEnvelopePanel envelope={evidence.actionEnvelope} /> : null}
      bottom={<EvidenceCommandBar situationId={situation.id} />}
      mobileNav={<MobileBottomNav />}
      copilot={<Copilot />}
    >
      <div className="pl-evidence-room">
        {/* Desktop center column */}
        <div className="pl-evidence-room__desktop">
          <header className="pl-evidence-room__header">
            <h1 className="pl-evidence-room__title">{situation.primary_fault}</h1>
            <p className="pl-evidence-room__location">{meta?.location ?? "—"}</p>
            <div className="pl-evidence-room__meta">
              <Metric
                label="Confidence"
                value={`${(situation.confidence * 100).toFixed(0)}%`}
                size="md"
              />
              <Metric
                label="Coverage"
                value={`${(situation.coverage * 100).toFixed(0)}%`}
                size="md"
              />
              <Badge variant={meta?.severity === "unknown" ? "unknown" : "warning"}>
                Severity {meta?.severity?.toUpperCase() ?? "WARNING"}
              </Badge>
              <Badge variant="readonly">Read-only</Badge>
              <span className="pl-evidence-room__collapse">{evidence.collapseSummary}</span>
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

          <section className="pl-evidence-room__section">
            <span className="pl-label">Evidence</span>
            <EvidenceTable items={evidence.evidence} />
          </section>

          <ContradictionPanel items={evidence.contradictions} />
          <MissingEvidencePanel items={evidence.missingItems} />
          <CausalPathPanel steps={evidence.causalPath} layout="horizontal" />
        </div>

        {/* Mobile stacked view */}
        <div className="pl-evidence-room__mobile">
          <MobileEvidenceView situation={situation} evidence={evidence} />
        </div>
      </div>
    </AppShell>
  );
}