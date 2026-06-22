import { useEffect, useMemo, useState } from "react";
import { useStudioDraftStore } from "../studio-forms/useStudioDraftStore";
import { compileLocalHmiPreview } from "./localPreviewCompiler";
import { PreviewDiffPanel } from "./PreviewDiffPanel";
import { PreviewIssueList } from "./PreviewIssueList";
import { PreviewMapPanel } from "./PreviewMapPanel";
import { PreviewReportPanel } from "./PreviewReportPanel";
import { PreviewStatusStrip } from "./PreviewStatusStrip";
import { diffPreviewAgainstCompiled } from "./previewDiff";
import type { PreviewCompileResult } from "./previewTypes";

const IDLE_RESULT: PreviewCompileResult = {
  status: "idle",
  issues: [],
  model: null,
};

interface CompilePreviewWorkbenchProps {
  compiledBundle?: unknown;
}

export function CompilePreviewWorkbench({ compiledBundle }: CompilePreviewWorkbenchProps) {
  const loaded = useStudioDraftStore((s) => s.loaded);
  const draftStatus = useStudioDraftStore((s) => s.status);
  const draftIssues = useStudioDraftStore((s) => s.issues);
  const dirtyFamilies = useStudioDraftStore((s) => s.dirtyFamilies);
  const loadInitialBundle = useStudioDraftStore((s) => s.loadInitialBundle);
  const validateDraft = useStudioDraftStore((s) => s.validateDraft);

  const [result, setResult] = useState<PreviewCompileResult>(IDLE_RESULT);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) loadInitialBundle();
  }, [loaded, loadInitialBundle]);

  const hasDraftErrors = draftIssues.some((i) => i.severity === "error");

  const diffItems = useMemo(
    () => diffPreviewAgainstCompiled({ preview: result.model, compiledBundle }),
    [result.model, compiledBundle],
  );

  function draftIssuesToPreview(state: ReturnType<typeof useStudioDraftStore.getState>["issues"]) {
    return state.map((i) => ({
      id: i.id,
      severity: i.severity,
      family: i.family,
      targetId: i.targetId,
      code: i.code,
      message: i.message,
      source: "draft_validation" as const,
    }));
  }

  function handleValidate() {
    validateDraft();
    const snapshot = useStudioDraftStore.getState().getDraftSnapshot();
    const errors = snapshot.issues.some((i) => i.severity === "error");
    setResult({
      status: errors ? "invalid" : "idle",
      issues: draftIssuesToPreview(snapshot.issues),
      model: null,
    });
  }

  function handleGenerate() {
    validateDraft();
    const snapshot = useStudioDraftStore.getState().getDraftSnapshot();
    if (snapshot.issues.some((i) => i.severity === "error")) {
      setResult({
        status: "invalid",
        issues: draftIssuesToPreview(snapshot.issues),
        model: null,
      });
      return;
    }
    const compiled = compileLocalHmiPreview({
      bundle: snapshot.bundle,
      draftIssues: snapshot.issues,
    });
    setResult(compiled);
    if (compiled.model?.map2d.nodes[0]) {
      setSelectedAssetId(compiled.model.map2d.nodes[0].id);
    }
  }

  function handleReset() {
    setResult(IDLE_RESULT);
    setSelectedAssetId(null);
  }

  const displayResult =
    result.status === "idle" && draftIssues.length > 0
      ? {
          status: hasDraftErrors ? ("invalid" as const) : ("idle" as const),
          issues: draftIssues.map((i) => ({
            id: i.id,
            severity: i.severity,
            family: i.family,
            targetId: i.targetId,
            code: i.code,
            message: i.message,
            source: "draft_validation" as const,
          })),
          model: null,
        }
      : result;

  return (
    <div className="compile-preview-workbench">
      <header className="compile-preview-workbench__intro">
        <h3>Local compile preview</h3>
        <p>
          Generates a deterministic read-only HMI preview from the Studio draft bundle. Local preview
          only — runtime is unchanged. Backend compile and save come later.
        </p>
      </header>

      <PreviewStatusStrip
        result={displayResult}
        draftStatus={draftStatus}
        dirtyFamilies={dirtyFamilies}
      />

      <div className="compile-preview-workbench__actions">
        <button type="button" className="pl-btn pl-btn--compact" onClick={handleValidate}>
          Validate draft
        </button>
        <button
          type="button"
          className="pl-btn pl-btn--compact"
          onClick={handleGenerate}
          disabled={hasDraftErrors}
          title={
            hasDraftErrors
              ? "Fix draft validation errors before generating preview."
              : "Generate local read-only preview"
          }
        >
          Generate local preview
        </button>
        <button type="button" className="pl-btn pl-btn--ghost pl-btn--compact" onClick={handleReset}>
          Reset local preview
        </button>
      </div>

      <div className="compile-preview-workbench__layout">
        <PreviewIssueList issues={displayResult.issues} />
        <PreviewReportPanel model={displayResult.model} />
        <PreviewMapPanel
          model={displayResult.model}
          selectedAssetId={selectedAssetId}
          onSelectAsset={setSelectedAssetId}
          invalid={hasDraftErrors && displayResult.status !== "compiled"}
        />
        <PreviewDiffPanel diffItems={diffItems} />
      </div>
    </div>
  );
}