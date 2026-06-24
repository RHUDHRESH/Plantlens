import { useStore } from "../../store/useStore";
import { Button } from "../ui/Button";
import { CommandInput } from "../ui/CommandInput";

export function StudioCommandBar() {
  const {
    studioParameterSearch,
    setStudioParameterSearch,
    assetDraftDirty,
    assetValidationStatus,
    assetDraftSaved,
    validateAssetDraft,
    saveAssetDraft,
    goBackToDag,
    goBackToMap,
  } = useStore();

  const canSubmit =
    assetValidationStatus === "valid" || assetValidationStatus === "warning";

  return (
    <div className="pl-studio-command-bar" role="toolbar" aria-label="Studio actions">
      <CommandInput
        placeholder="Search parameter…"
        value={studioParameterSearch}
        onChange={(e) => setStudioParameterSearch(e.target.value)}
        readOnlyHint={false}
        className="pl-studio-command-bar__search"
      />
      <p className="pl-studio-command-bar__notice">
        Draft changes require engineer approval before runtime use.
      </p>
      <div className="pl-studio-command-bar__actions">
        <Button variant="secondary" size="md" onClick={validateAssetDraft}>
          Validate
        </Button>
        <Button variant="ghost" size="md" disabled title="HMI preview scaffold — not wired">
          Preview HMI
        </Button>
        <Button variant="secondary" size="md" onClick={goBackToDag}>
          Back DAG
        </Button>
        <Button variant="secondary" size="md" onClick={goBackToMap}>
          Back Map
        </Button>
        <Button
          variant="secondary"
          size="md"
          disabled={!assetDraftDirty}
          onClick={saveAssetDraft}
        >
          {assetDraftSaved && !assetDraftDirty ? "Draft Saved" : "Save Draft"}
        </Button>
        <Button
          variant="primary"
          size="md"
          disabled={!canSubmit}
          title={
            canSubmit
              ? "Submit for approval (local scaffold)"
              : "Validate draft before submitting"
          }
          onClick={() => {
            /* Approval workflow scaffold — no backend write */
          }}
        >
          Submit for Engineer Approval
        </Button>
      </div>
    </div>
  );
}