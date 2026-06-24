import { useStore } from "../../store/useStore";
import type { Situation } from "../../store/useStore";
import type { DagGraphMeta, DagLayerName } from "./dagTypes";
import { Panel } from "../ui/Panel";
import { DagLegend } from "./DagLegend";
import { DagPathSummary } from "./DagPathSummary";
import { GraphStateBadge } from "./GraphStateBadge";
import { IconButton } from "../ui/IconButton";

const LAYERS: { key: DagLayerName; label: string }[] = [
  { key: "faults", label: "Faults" },
  { key: "signals", label: "Signals" },
  { key: "alarms", label: "Alarms" },
  { key: "actions", label: "Actions" },
  { key: "hiddenNormal", label: "Hidden normal" },
];

interface DagLayerPanelProps {
  situation: Situation;
  meta: DagGraphMeta;
}

export function DagLayerPanel({ situation, meta }: DagLayerPanelProps) {
  const { dagLayerVisibility, toggleDagLayer, toggleLeftRail } = useStore();

  return (
    <div className="pl-dag-layer-panel">
      <header className="pl-dag-layer-panel__header">
        <h2 className="pl-dag-layer-panel__title">Graph Layers</h2>
        <IconButton label="Close layer panel" onClick={toggleLeftRail}>
          <CloseIcon />
        </IconButton>
      </header>

      <Panel title="Layers">
        <ul className="pl-dag-layer-panel__toggles" role="list">
          {LAYERS.map((layer) => (
            <li key={layer.key}>
              <button
                type="button"
                className={`pl-dag-layer-toggle ${
                  dagLayerVisibility[layer.key] ? "pl-dag-layer-toggle--on" : ""
                }`}
                onClick={() => toggleDagLayer(layer.key)}
                aria-pressed={dagLayerVisibility[layer.key]}
              >
                <span className="pl-dag-layer-toggle__dot" aria-hidden="true" />
                {layer.label}
              </button>
            </li>
          ))}
        </ul>
        {/* Layer filtering: nodes hidden via dagLayerVisibility in DagCanvas */}
      </Panel>

      <Panel title="Situation">
        <p className="pl-dag-layer-panel__situation">{situation.primary_fault}</p>
        <p className="pl-dag-layer-panel__stats">
          Conf {(situation.confidence * 100).toFixed(0)}% · Cov{" "}
          {(situation.coverage * 100).toFixed(0)}%
        </p>
      </Panel>

      <Panel title="Legend">
        <DagLegend />
      </Panel>

      <Panel title="Graph State">
        <div className="pl-dag-layer-panel__badges">
          <GraphStateBadge label="Approved graph" variant="success" />
          <GraphStateBadge label="Live traversal" variant="info" />
          <GraphStateBadge label="Deterministic" variant="normal" />
          <GraphStateBadge label="Read-only" variant="readonly" />
        </div>
        <DagPathSummary meta={meta} />
      </Panel>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M5.5 4.5L10 9l4.5-4.5L15 5.5 10.5 10 15 14.5l-1.5 1.5L10 11.5 5.5 16 4 14.5 8.5 10 4 5.5z" />
    </svg>
  );
}