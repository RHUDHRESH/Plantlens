import { useMemo } from "react";
import { useStore } from "../../store/useStore";
import { Panel } from "../ui/Panel";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { LayoutValidationPanel } from "./LayoutValidationPanel";

function bindingSummary(bindings: { signal: string; status: string }[]): string {
  return bindings
    .map((b) => {
      const mark =
        b.status === "bound" ? "✓" : b.status === "optional" ? "?" : "×";
      return `${b.signal} ${mark}`;
    })
    .join(" · ");
}

export function MobilePlantLayoutStudioView() {
  const {
    layoutBlocks,
    layoutConnections,
    selectedLayoutBlockId,
    setSelectedLayoutBlockId,
    layoutValidationItems,
    layoutValidationStatus,
    layoutDraftDirty,
    validateLayoutDraft,
    saveLayoutDraft,
    addBlockFromPalette,
    role,
  } = useStore();

  const editable = role === "engineer";
  const selected = useMemo(
    () => layoutBlocks.find((b) => b.id === selectedLayoutBlockId) ?? layoutBlocks[2] ?? null,
    [layoutBlocks, selectedLayoutBlockId],
  );

  const canSubmit =
    layoutValidationStatus === "valid" || layoutValidationStatus === "warning";

  const canvasSummary = useMemo(() => {
    const lines: string[] = [];
    const powerChain = ["PWR-101", "RLY-101", "M-101"];
    const powerLine = powerChain
      .map((id) => layoutBlocks.find((b) => b.instanceId === id)?.instanceId ?? id)
      .join(" → ");
    if (powerLine) lines.push(powerLine);

    const fanLine = ["F-101", "B-101"]
      .map((id) => layoutBlocks.find((b) => b.instanceId === id)?.instanceId)
      .filter(Boolean)
      .join(" → ");
    if (fanLine) lines.push(`       ${fanLine}`);

    const sensors = layoutBlocks.filter((b) => b.kind === "sensor");
    const plc = layoutBlocks.find((b) => b.kind === "plc");
    if (sensors.length && plc) {
      lines.push(
        sensors.map((s) => s.instanceId).join(" ─┐"),
        `              └→ ${plc.instanceId}`,
      );
    }

    return lines.length > 0 ? lines : ["No blocks placed"];
  }, [layoutBlocks]);

  return (
    <div className="pl-mobile-layout">
      <header className="pl-mobile-layout__header">
        <span className="pl-label">Layout</span>
        <h1 className="pl-mobile-layout__title">Line A</h1>
        <div className="pl-mobile-layout__badges">
          <Badge variant="info">MODEL DRAFT</Badge>
          <Badge variant="readonly">READ-ONLY PLANT</Badge>
        </div>
      </header>

      {!editable && (
        <div className="pl-mobile-layout__banner" role="status">
          Plant Layout Studio is view-only for this role.
        </div>
      )}

      <Panel title="Canvas" variant="light">
        <pre className="pl-mobile-layout__canvas-summary" aria-label="Layout summary">
          {canvasSummary.join("\n")}
        </pre>
        <p className="pl-mobile-layout__meta">
          {layoutBlocks.length} blocks · {layoutConnections.length} connections
        </p>
      </Panel>

      <Panel title="Selected" variant="light">
        {selected ? (
          <>
            <p className="pl-mobile-layout__selected-id">{selected.instanceId}</p>
            <p className="pl-mobile-layout__meta">type: {selected.typeId}</p>
            <p className="pl-mobile-layout__meta">
              position: x{selected.x} y{selected.y} z{selected.z}
            </p>
            <p className="pl-mobile-layout__meta">
              bindings: {bindingSummary(selected.bindings)}
            </p>
            <div className="pl-mobile-layout__block-pick">
              {layoutBlocks.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={[
                    "pl-mobile-layout__pick-btn",
                    b.id === selected.id ? "pl-mobile-layout__pick-btn--active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setSelectedLayoutBlockId(b.id)}
                  aria-pressed={b.id === selected.id}
                >
                  {b.instanceId}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="pl-mobile-layout__meta">No block selected</p>
        )}
      </Panel>

      <Panel title="Add block" variant="light">
        <div className="pl-mobile-layout__categories" aria-hidden="true">
          <span>Motors</span>
          <span>Air</span>
          <span>Power</span>
          <span>Sensors</span>
          <span>Groups</span>
        </div>
        <div className="pl-mobile-layout__add-actions">
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            disabled={!editable}
            onClick={() => addBlockFromPalette("pal-motor-dc")}
          >
            + DC Motor
          </Button>
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            disabled={!editable}
            onClick={() => addBlockFromPalette("pal-fan-axial")}
          >
            + Fan
          </Button>
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            disabled={!editable}
            onClick={() => addBlockFromPalette("pal-sensor-current")}
          >
            + Sensor
          </Button>
        </div>
      </Panel>

      <Panel title="Validation" variant="light">
        <LayoutValidationPanel items={layoutValidationItems} compact />
      </Panel>

      <div className="pl-mobile-layout__actions">
        <Button variant="secondary" size="lg" fullWidth onClick={validateLayoutDraft}>
          Validate
        </Button>
        <Button variant="ghost" size="lg" fullWidth disabled title="HMI preview scaffold">
          Preview HMI
        </Button>
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          disabled={!layoutDraftDirty || !editable}
          onClick={saveLayoutDraft}
        >
          Save Draft
        </Button>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={!canSubmit || !editable}
          onClick={() => {
            /* scaffold — no backend write */
          }}
        >
          Submit Review
        </Button>
      </div>
    </div>
  );
}