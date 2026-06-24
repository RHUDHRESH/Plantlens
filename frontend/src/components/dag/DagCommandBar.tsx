import { useStore } from "../../store/useStore";
import { Button } from "../ui/Button";
import { CommandInput } from "../ui/CommandInput";

export function DagCommandBar() {
  const {
    dagHighlightMode,
    dagSearchQuery,
    setDagHighlightMode,
    setDagSearchQuery,
    goBackToEvidence,
    goBackToMap,
  } = useStore();

  return (
    <div className="pl-dag-command-bar" role="toolbar" aria-label="DAG actions">
      <CommandInput
        placeholder="Search node/edge…"
        value={dagSearchQuery}
        onChange={(e) => setDagSearchQuery(e.target.value)}
        readOnlyHint={false}
        className="pl-dag-command-bar__search"
      />
      <div className="pl-dag-command-bar__actions">
        <Button
          variant={dagHighlightMode === "path" ? "primary" : "secondary"}
          size="md"
          onClick={() => setDagHighlightMode("path")}
        >
          Highlight path
        </Button>
        <Button
          variant={dagHighlightMode === "contradictions" ? "primary" : "secondary"}
          size="md"
          onClick={() => setDagHighlightMode("contradictions")}
        >
          Show contradictions
        </Button>
        <Button
          variant={dagHighlightMode === "missing" ? "primary" : "secondary"}
          size="md"
          onClick={() => setDagHighlightMode("missing")}
        >
          Show missing
        </Button>
        <Button variant="secondary" size="md" onClick={goBackToEvidence}>
          Back Evidence
        </Button>
        <Button variant="secondary" size="md" onClick={goBackToMap}>
          Back Map
        </Button>
        <Button variant="ghost" size="md" disabled title="Disabled in live read-only view">
          Propose Fix — disabled live
        </Button>
      </div>
    </div>
  );
}