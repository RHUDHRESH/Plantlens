import { useStore } from "../../store/useStore";
import { Button } from "../ui/Button";
import { CommandInput } from "../ui/CommandInput";

export function LayoutCommandBar() {
  const {
    layoutPaletteSearch,
    setLayoutPaletteSearch,
    layoutDraftDirty,
    layoutDraftSaved,
    layoutValidationStatus,
    validateLayoutDraft,
    saveLayoutDraft,
    goBackToAssetStudio,
    goBackToMap,
    role,
  } = useStore();

  const canSubmit =
    layoutValidationStatus === "valid" || layoutValidationStatus === "warning";
  const editable = role === "engineer";

  return (
    <div className="pl-layout-command-bar" role="toolbar" aria-label="Layout studio actions">
      <CommandInput
        placeholder="Search block…"
        value={layoutPaletteSearch}
        onChange={(e) => setLayoutPaletteSearch(e.target.value)}
        className="pl-layout-command-bar__search"
        readOnlyHint={!editable}
      />

      <p className="pl-layout-command-bar__notice">
        Layout drafts require engineer approval before runtime use.
      </p>

      <div className="pl-layout-command-bar__actions">
        <Button variant="ghost" size="md" disabled title="Auto-align scaffold — not wired">
          Auto-align
        </Button>
        <Button variant="secondary" size="md" onClick={validateLayoutDraft}>
          Validate Layout
        </Button>
        <Button variant="ghost" size="md" disabled title="HMI preview scaffold — not wired">
          Preview HMI
        </Button>
        <Button variant="ghost" size="md" disabled title="Undo scaffold — not wired">
          Undo
        </Button>
        <Button variant="ghost" size="md" disabled title="Redo scaffold — not wired">
          Redo
        </Button>
        <Button variant="secondary" size="md" onClick={goBackToAssetStudio}>
          Back Asset Spec
        </Button>
        <Button variant="secondary" size="md" onClick={goBackToMap}>
          Back Map
        </Button>
        <Button
          variant="secondary"
          size="md"
          disabled={!layoutDraftDirty || !editable}
          onClick={saveLayoutDraft}
        >
          {layoutDraftSaved && !layoutDraftDirty ? "Draft Saved" : "Save Draft"}
        </Button>
        <Button
          variant="primary"
          size="md"
          disabled={!canSubmit || !editable}
          title={
            canSubmit
              ? "Submit for approval (local scaffold)"
              : "Validate layout before submitting"
          }
          onClick={() => {
            /* Approval workflow scaffold — no backend write */
          }}
        >
          Submit Review
        </Button>
      </div>
    </div>
  );
}