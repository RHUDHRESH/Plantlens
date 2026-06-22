import type { StudioDraftFamily, StudioDraftStatus } from "../studio-forms/studioDraftTypes";
import type { PreviewCompileResult } from "./previewTypes";

interface PreviewStatusStripProps {
  result: PreviewCompileResult;
  draftStatus: StudioDraftStatus;
  dirtyFamilies: Record<StudioDraftFamily, boolean>;
}

const STATUS_LABELS = {
  idle: "Idle",
  validating: "Validating",
  invalid: "Invalid",
  compiled: "Compiled",
  failed: "Failed",
} as const;

export function PreviewStatusStrip({ result, draftStatus, dirtyFamilies }: PreviewStatusStripProps) {
  const errors = result.issues.filter((i) => i.severity === "error").length;
  const warnings = result.issues.filter((i) => i.severity === "warning").length;
  const dirty = (Object.entries(dirtyFamilies) as Array<[StudioDraftFamily, boolean]>)
    .filter(([, v]) => v)
    .map(([k]) => k);

  const summary = result.model?.summary;

  return (
    <div className="preview-status-strip" role="status">
      <span className={`preview-status-strip__chip preview-status-strip__chip--${result.status}`}>
        {STATUS_LABELS[result.status]}
      </span>
      <span className="preview-status-strip__metric">Draft: {draftStatus}</span>
      <span className="preview-status-strip__metric">{errors} errors</span>
      <span className="preview-status-strip__metric">{warnings} warnings</span>
      {summary ? (
        <>
          <span className="preview-status-strip__metric">{summary.assetCount} assets</span>
          <span className="preview-status-strip__metric">{summary.tagCount} tags</span>
          <span className="preview-status-strip__metric">{summary.alarmRuleCount} alarms</span>
          <span className="preview-status-strip__metric">{summary.causalEdgeCount} causal edges</span>
          <span className="preview-status-strip__metric">{summary.actionCount} actions</span>
        </>
      ) : null}
      {dirty.length > 0 ? (
        <span className="preview-status-strip__metric">Dirty: {dirty.join(", ")}</span>
      ) : null}
      <p className="preview-readonly-badge">Preview is local and read-only. Runtime is unchanged.</p>
    </div>
  );
}