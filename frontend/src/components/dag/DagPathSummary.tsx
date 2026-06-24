import type { DagGraphMeta } from "./dagTypes";

interface DagPathSummaryProps {
  meta: DagGraphMeta;
}

export function DagPathSummary({ meta }: DagPathSummaryProps) {
  return (
    <div className="pl-dag-path-summary">
      <div className="pl-dag-path-summary__row">
        <span className="pl-label">Timeline fit</span>
        <span>{meta.timelineFit}</span>
      </div>
      <div className="pl-dag-path-summary__row">
        <span className="pl-label">Collapse</span>
        <span>{meta.collapseSummary}</span>
      </div>
      <div className="pl-dag-path-summary__row">
        <span className="pl-label">Topological order</span>
        <span>{meta.topologicalOrder}</span>
      </div>
      <div className="pl-dag-path-summary__row">
        <span className="pl-label">Traversal</span>
        <span>{meta.traversalNote}</span>
      </div>
    </div>
  );
}