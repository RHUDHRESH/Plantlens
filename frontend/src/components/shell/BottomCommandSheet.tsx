import { useStore } from "../../store/useStore";
import { CalmCard } from "../CalmCard";
import { Button } from "../ui/Button";
import { CommandInput } from "../ui/CommandInput";
import { Sheet } from "../ui/Sheet";
import { Badge } from "../ui/Badge";

export function BottomCommandSheet() {
  const {
    bottomSheetMode,
    setBottomSheetMode,
    situations,
    activeSituation,
    selectedSituationId,
    setSelectedSituationId,
    setActive,
    role,
  } = useStore();

  const topSituation =
    situations.find((s) => s.id === selectedSituationId) ??
    activeSituation ??
    situations[0] ??
    null;

  const handleQuery = () => {
    // Scaffold: read-only query routing — no plant control
  };

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
              <Badge variant="warning" dot>
                Situation
              </Badge>
              <span className="pl-command-sheet__peek-title">{topSituation.primary_fault}</span>
            </button>
          ) : (
            <span className="pl-command-sheet__idle">No active situations — all normal</span>
          )}
        </div>
      )}

      {bottomSheetMode === "peek" && topSituation && (
        <div className="pl-command-sheet__peek">
          <div className="pl-command-sheet__peek-header">
            <span className="pl-label">Top situation</span>
            <Button variant="ghost" size="sm" onClick={() => setBottomSheetMode("expanded")}>
              Expand
            </Button>
          </div>
          <p className="pl-command-sheet__peek-fault">{topSituation.primary_fault}</p>
          <div className="pl-command-sheet__peek-stats">
            <span>Confidence {(topSituation.confidence * 100).toFixed(0)}%</span>
            <span>Coverage {(topSituation.coverage * 100).toFixed(0)}%</span>
          </div>
        </div>
      )}

      {bottomSheetMode === "expanded" && (
        <div className="pl-command-sheet__expanded">
          <div className="pl-command-sheet__section">
            <span className="pl-label">Command</span>
            <CommandInput
              placeholder="Ask or search (read-only)…"
              onSubmit={handleQuery}
            />
          </div>

          <div className="pl-command-sheet__quick-actions">
            <span className="pl-label">Quick actions</span>
            <div className="pl-command-sheet__action-row">
              <Button variant="secondary" size="sm" disabled title="Scaffold — no plant control">
                View evidence
              </Button>
              <Button variant="secondary" size="sm" disabled title="Scaffold — no plant control">
                Export snapshot
              </Button>
              {role === "engineer" && (
                <Button variant="ghost" size="sm" disabled title="Scaffold — engineer view only">
                  DAG preview
                </Button>
              )}
            </div>
            <span className="pl-scaffold-tag">Scaffold / Demo — read-only</span>
          </div>

          {topSituation && (
            <div className="pl-command-sheet__section">
              <span className="pl-label">Active situation</span>
              <CalmCard situation={topSituation} />
            </div>
          )}

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
                  onClick={() => {
                    setSelectedSituationId(s.id);
                    setActive(s);
                  }}
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