import { useMemo } from "react";
import { useStore } from "../store/useStore";
import { AppShell } from "../components/shell/AppShell";
import { TopStatusBar } from "../components/shell/TopStatusBar";
import { MobileBottomNav } from "../components/shell/MobileBottomNav";
import { Copilot } from "../copilot/Copilot";
import { Badge } from "../components/ui/Badge";
import { IconButton } from "../components/ui/IconButton";
import { AssetLibraryPanel } from "../components/studio/AssetLibraryPanel";
import { AssetSpecSheet } from "../components/studio/AssetSpecSheet";
import { AssetPreviewPanel } from "../components/studio/AssetPreviewPanel";
import { StudioCommandBar } from "../components/studio/StudioCommandBar";
import { MobileAssetStudioView } from "../components/studio/MobileAssetStudioView";
import { getAssetTemplate } from "../components/studio/demoAssetTemplates";

export function AssetStudio() {
  const {
    role,
    leftRailOpen,
    rightPanelOpen,
    selectedAssetTypeId,
    selectedAssetInstanceId,
    assetDraftParameters,
    assetDraftDirty,
    assetValidationItems,
    assetValidationStatus,
    studioParameterSearch,
    updateAssetParameter,
    validateAssetDraft,
    toggleRightPanel,
  } = useStore();

  const template = useMemo(
    () => getAssetTemplate(selectedAssetTypeId),
    [selectedAssetTypeId],
  );

  if (!template) {
    return (
      <div className="pl-studio pl-studio--empty">
        <p>No asset template selected.</p>
      </div>
    );
  }

  const editable = role === "engineer";
  const canSubmit =
    assetValidationStatus === "valid" || assetValidationStatus === "warning";

  return (
    <AppShell
      top={<TopStatusBar />}
      left={leftRailOpen ? <AssetLibraryPanel /> : null}
      right={
        rightPanelOpen ? (
          <div className="pl-studio-right">
            <header className="pl-studio-right__header">
              <IconButton label="Close preview panel" onClick={toggleRightPanel}>
                <CloseIcon />
              </IconButton>
            </header>
            <AssetPreviewPanel
              template={template}
              draftValues={assetDraftParameters}
              validationItems={assetValidationItems}
            />
          </div>
        ) : null
      }
      bottom={<StudioCommandBar />}
      mobileNav={<MobileBottomNav />}
      copilot={<Copilot />}
    >
      <div className="pl-studio">
        {!editable && (
          <div className="pl-studio__banner" role="status">
            Asset Studio is view-only for this role. Switch to Engineer to edit model drafts.
          </div>
        )}

        <div className="pl-studio__mode-bar">
          <Badge variant="info">Studio Mode</Badge>
          <Badge variant={editable ? "warning" : "readonly"}>
            {editable ? "Model editing" : "View only"}
          </Badge>
          {assetDraftDirty && <Badge variant="warning">Unsaved draft</Badge>}
        </div>

        <div className="pl-studio__desktop">
          <AssetSpecSheet
            template={template}
            instanceId={selectedAssetInstanceId}
            draftValues={assetDraftParameters}
            editable={editable}
            dirty={assetDraftDirty}
            parameterSearch={studioParameterSearch}
            onParameterChange={updateAssetParameter}
          />
        </div>

        <div className="pl-studio__mobile">
          <MobileAssetStudioView
            template={template}
            instanceId={selectedAssetInstanceId}
            draftValues={assetDraftParameters}
            editable={editable}
            validationItems={assetValidationItems}
            onValidate={validateAssetDraft}
            onSubmit={() => {
              /* scaffold — no backend write */
            }}
            canSubmit={canSubmit}
          />
        </div>
      </div>
    </AppShell>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M5.5 4.5L10 9l4.5-4.5L15 5.5 10.5 10 15 14.5l-1.5 1.5L10 11.5 5.5 16 4 14.5 8.5 10 4 5.5z" />
    </svg>
  );
}