import { useMemo } from "react";
import { useStore } from "../../store/useStore";
import { LayoutValidationPanel } from "./LayoutValidationPanel";
import { Badge } from "../ui/Badge";

function bindingMarker(status: string): string {
  switch (status) {
    case "bound":
      return "✓";
    case "missing":
      return "×";
    case "optional":
      return "?";
    case "derived":
      return "◆";
    default:
      return "○";
  }
}

export function LayoutInspectorPanel() {
  const {
    layoutBlocks,
    layoutConnections,
    selectedLayoutBlockId,
    layoutValidationItems,
    layoutValidationStatus,
  } = useStore();

  const block = useMemo(
    () => layoutBlocks.find((b) => b.id === selectedLayoutBlockId) ?? null,
    [layoutBlocks, selectedLayoutBlockId],
  );

  const relationships = useMemo(() => {
    if (!block) return [];
    const incoming = layoutConnections
      .filter((c) => c.targetId === block.id)
      .map((c) => {
        const src = layoutBlocks.find((b) => b.id === c.sourceId);
        return `← ${src?.instanceId ?? c.sourceId} (${c.kind})`;
      });
    const outgoing = layoutConnections
      .filter((c) => c.sourceId === block.id)
      .map((c) => {
        const tgt = layoutBlocks.find((b) => b.id === c.targetId);
        return `→ ${tgt?.instanceId ?? c.targetId} (${c.kind})`;
      });
    return [...incoming, ...outgoing];
  }, [block, layoutBlocks, layoutConnections]);

  return (
    <aside className="pl-layout-inspector" aria-label="Selection inspector">
      <header className="pl-layout-inspector__header">
        <h2 className="pl-layout-inspector__title">Selection Inspector</h2>
      </header>

      {block ? (
        <div className="pl-layout-inspector__body">
          <section className="pl-layout-inspector__section">
            <h3 className="pl-layout-inspector__label">Selected</h3>
            <p className="pl-layout-inspector__value pl-layout-inspector__value--large">
              {block.instanceId}
            </p>
            <p className="pl-layout-inspector__sub">{block.label}</p>
          </section>

          <section className="pl-layout-inspector__section">
            <h3 className="pl-layout-inspector__label">Type</h3>
            <p className="pl-layout-inspector__value">{block.typeId}</p>
            <p className="pl-layout-inspector__sub">kind: {block.kind}</p>
          </section>

          <section className="pl-layout-inspector__section">
            <h3 className="pl-layout-inspector__label">Position</h3>
            <dl className="pl-layout-inspector__coords">
              <div><dt>x</dt><dd>{block.x}</dd></div>
              <div><dt>y</dt><dd>{block.y}</dd></div>
              <div><dt>z</dt><dd>{block.z}</dd></div>
            </dl>
          </section>

          <section className="pl-layout-inspector__section">
            <h3 className="pl-layout-inspector__label">Bindings</h3>
            <ul className="pl-layout-inspector__bindings">
              {block.bindings.map((b) => (
                <li key={b.signal}>
                  <span className="pl-layout-inspector__bind-marker" aria-hidden="true">
                    {bindingMarker(b.status)}
                  </span>
                  <span>{b.signal}</span>
                  {b.source && (
                    <span className="pl-layout-inspector__bind-src">{b.source}</span>
                  )}
                </li>
              ))}
              {block.bindings.length === 0 && (
                <li className="pl-layout-inspector__empty">No bindings defined</li>
              )}
            </ul>
          </section>

          {relationships.length > 0 && (
            <section className="pl-layout-inspector__section">
              <h3 className="pl-layout-inspector__label">Relationships</h3>
              <ul className="pl-layout-inspector__relations">
                {relationships.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="pl-layout-inspector__section">
            <h3 className="pl-layout-inspector__label">Validation</h3>
            <Badge
              variant={
                layoutValidationStatus === "valid"
                  ? "success"
                  : layoutValidationStatus === "warning"
                    ? "warning"
                    : layoutValidationStatus === "error"
                      ? "critical"
                      : "unknown"
              }
            >
              {layoutValidationStatus}
            </Badge>
          </section>
        </div>
      ) : (
        <p className="pl-layout-inspector__placeholder">
          Select a block to inspect model bindings.
        </p>
      )}

      <div className="pl-layout-inspector__validation">
        <LayoutValidationPanel items={layoutValidationItems} />
      </div>

      <footer className="pl-layout-inspector__footer">
        <p>Draft layout only. No plant write path.</p>
      </footer>
    </aside>
  );
}