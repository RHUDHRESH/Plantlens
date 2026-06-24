import { useStore } from "../../store/useStore";
import { getSituationMeta } from "../../data/demoPlant";
import { CalmCard } from "../CalmCard";
import { PressHoldAck } from "../PressHoldAck";
import { Button } from "../ui/Button";
import { CommandInput } from "../ui/CommandInput";
import { Sheet } from "../ui/Sheet";
import { Metric } from "../ui/Metric";

export function BottomCommandSheet() {
  const {
    bottomSheetMode,
    setBottomSheetMode,
    situations,
    activeSituation,
    selectedSituationId,
    setSelectedSituation,
    openEvidenceRoom,
    toggleCopilot,
    toggleRightPanel,
  } = useStore();

  const topSituation =
    situations.find((s) => s.id === selectedSituationId) ??
    activeSituation ??
    situations[0] ??
    null;

  const meta = topSituation ? getSituationMeta(topSituation.id) : undefined;
  const whyLine = meta
    ? [...meta.supportingEvidence.slice(0, 2), ...meta.missingEvidence.slice(0, 1)].join(" + ")
    : "";

  const openEvidence = () => {
    if (topSituation) openEvidenceRoom(topSituation.id);
  };

  const quickActions = [
    { label: "View evidence", action: openEvidence },
    { label: "Explain grouping", action: () => toggleCopilot() },
    { label: "Open inspector", action: () => toggleRightPanel() },
    { label: "Ask copilot", action: () => toggleCopilot() },
  ] as const;

  return (
    <Sheet mode={bottomSheetMode} onModeChange={setBottomSheetMode}>
      {bottomSheetMode === "collapsed" && (
        <div className="pl-command-sheet__collapsed">
          {topSituation ? (
            <button
              type="button"
              className="pl-command-sheet__peek-trigger"
              onClick={() => setBottomSheetMode("peek")}
            >
              <span className="pl-command-sheet__peek-title">{topSituation.primary_fault}</span>
            </button>
          ) : (
            <span className="pl-command-sheet__idle">No active situations — all normal</span>
          )}
        </div>
      )}

      {bottomSheetMode === "peek" && topSituation && (
        <div className="pl-command-sheet__peek">
          <h3 className="pl-command-sheet__headline">{topSituation.primary_fault}</h3>
          <p className="pl-command-sheet__location">{meta?.location ?? "—"}</p>
          <div className="pl-command-sheet__peek-metrics">
            <Metric label="Conf" value={`${(topSituation.confidence * 100).toFixed(0)}%`} size="sm" />
            <Metric label="Cov" value={`${(topSituation.coverage * 100).toFixed(0)}%`} size="sm" />
          </div>
          {whyLine && <p className="pl-command-sheet__why">Why: {whyLine}</p>}
          <CommandInput placeholder="Ask read-only copilot…" readOnlyHint />
          <div className="pl-command-sheet__action-row">
            <Button variant="secondary" size="sm" onClick={openEvidence}>
              View evidence
            </Button>
            {topSituation && <PressHoldAck situationId={topSituation.id} compact />}
          </div>
        </div>
      )}

      {bottomSheetMode === "expanded" && (
        <div className="pl-command-sheet__expanded">
          {topSituation && <CalmCard situation={topSituation} />}

          <div className="pl-command-sheet__section">
            <span className="pl-label">Command</span>
            <CommandInput placeholder="Ask read-only copilot…" />
          </div>

          <div className="pl-command-sheet__quick-actions">
            <span className="pl-label">Quick actions</span>
            <div className="pl-command-sheet__action-row">
              {quickActions.map((a) => (
                <Button key={a.label} variant="secondary" size="sm" onClick={a.action}>
                  {a.label}
                </Button>
              ))}
            </div>
          </div>

          {situations.length > 1 && (
            <div className="pl-command-sheet__situation-list">
              <span className="pl-label">All situations</span>
              {situations.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`pl-command-sheet__situation-item ${
                    s.id === topSituation?.id ? "pl-command-sheet__situation-item--active" : ""
                  }`}
                  onClick={() => setSelectedSituation(s.id)}
                >
                  {s.primary_fault}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}