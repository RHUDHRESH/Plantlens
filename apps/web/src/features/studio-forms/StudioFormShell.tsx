import { useEffect, useMemo } from "react";
import type { StudioRouteState } from "../studio-launchpad/studioTypes";
import { ActionEnvelopeForm } from "./ActionEnvelopeForm";
import { AlarmRuleForm } from "./AlarmRuleForm";
import { AssetForm } from "./AssetForm";
import { CausalEdgeForm } from "./CausalEdgeForm";
import { EntityList } from "./EntityList";
import { TagForm } from "./TagForm";
import { ValidationPanel } from "./ValidationPanel";
import {
  entityIdFromRecord,
  selectAssetOptions,
  selectEntitiesForFamily,
  selectIssuesForFamily,
  selectIssuesForTarget,
  selectNodeOptions,
  selectRoles,
  selectTagOptions,
  surfaceToFamily,
} from "./studioSelectors";
import type { StudioDraftFamily } from "./studioDraftTypes";
import { useStudioDraftStore } from "./useStudioDraftStore";

interface StudioFormShellProps {
  route: StudioRouteState;
}

const STATUS_LABELS = {
  clean: "Clean",
  dirty: "Dirty — local edits not saved",
  invalid: "Invalid — fix errors before compile",
} as const;

function familyFromRoute(route: StudioRouteState): StudioDraftFamily | null {
  return surfaceToFamily(route.surface);
}

export function StudioFormShell({ route }: StudioFormShellProps) {
  const loaded = useStudioDraftStore((s) => s.loaded);
  const bundle = useStudioDraftStore((s) => s.bundle);
  const status = useStudioDraftStore((s) => s.status);
  const issues = useStudioDraftStore((s) => s.issues);
  const dirtyFamilies = useStudioDraftStore((s) => s.dirtyFamilies);
  const selectedFamily = useStudioDraftStore((s) => s.selectedFamily);
  const selectedTargetId = useStudioDraftStore((s) => s.selectedTargetId);
  const loadInitialBundle = useStudioDraftStore((s) => s.loadInitialBundle);
  const selectTarget = useStudioDraftStore((s) => s.selectTarget);
  const applyPatch = useStudioDraftStore((s) => s.applyPatch);

  const family = familyFromRoute(route);

  useEffect(() => {
    if (!loaded) loadInitialBundle();
  }, [loaded, loadInitialBundle]);

  useEffect(() => {
    if (!family) return;
    if (route.targetId) {
      selectTarget(family, route.targetId);
      return;
    }
    const entities = selectEntitiesForFamily(bundle, family);
    const firstId = entities[0] ? entityIdFromRecord(family, entities[0]) : null;
    if (firstId && selectedFamily !== family) {
      selectTarget(family, firstId);
    } else if (!firstId) {
      selectTarget(family, null);
    }
  }, [family, route.targetId, bundle, selectTarget, selectedFamily]);

  const activeFamily = family ?? selectedFamily;
  const activeTargetId = route.targetId ?? selectedTargetId;

  const entities = useMemo(
    () => (activeFamily ? selectEntitiesForFamily(bundle, activeFamily) : []),
    [bundle, activeFamily],
  );

  const selectedEntity = useMemo(() => {
    if (!activeFamily || !activeTargetId) return null;
    return entities.find((e) => entityIdFromRecord(activeFamily, e) === activeTargetId) ?? null;
  }, [entities, activeFamily, activeTargetId]);

  const familyIssues = useMemo(
    () => (activeFamily ? selectIssuesForFamily({ issues }, activeFamily) : issues),
    [issues, activeFamily],
  );

  const targetIssues = useMemo(() => {
    if (!activeFamily || !activeTargetId) return familyIssues;
    return selectIssuesForTarget({ issues }, activeFamily, activeTargetId);
  }, [issues, activeFamily, activeTargetId, familyIssues]);

  const assetOptions = useMemo(() => selectAssetOptions(bundle), [bundle]);
  const tagOptions = useMemo(() => selectTagOptions(bundle), [bundle]);
  const nodeOptions = useMemo(() => selectNodeOptions(bundle), [bundle]);
  const assetTypes = useMemo(
    () => selectEntitiesForFamily(bundle, "plant").map((a) => String(a.type ?? "")),
    [bundle],
  );
  const roles = useMemo(() => selectRoles(bundle), [bundle]);

  if (route.surface === "role_view") {
    return (
      <div className="studio-form-shell">
        <div className={`studio-form-shell__status studio-form-shell__status--${status}`} role="status">
          Draft status: {STATUS_LABELS[status]}
        </div>
        <div className="studio-form-shell__layout">
          <div className="studio-form-shell__form">
            <h3>Role views</h3>
            <p className="studio-form-field__hint">
              Role view stubs are represented as plant roles only in this prompt. Full role-view authoring
              comes after draft persistence.
            </p>
            <ul>
              {roles.map((role) => (
                <li key={role}>{role}</li>
              ))}
            </ul>
          </div>
          <ValidationPanel issues={issues} selectedFamily="plant" />
        </div>
        <DisabledActionsFooter />
      </div>
    );
  }

  if (!activeFamily) {
    return null;
  }

  return (
    <div className="studio-form-shell">
      <div className={`studio-form-shell__status studio-form-shell__status--${status}`} role="status">
        Draft status: {STATUS_LABELS[status]}
      </div>

      <div className="studio-form-shell__layout">
        <EntityList
          family={activeFamily}
          items={entities}
          selectedTargetId={activeTargetId}
          issues={familyIssues}
          familyDirty={dirtyFamilies[activeFamily]}
          onSelect={(id) => selectTarget(activeFamily, id)}
        />

        <div className="studio-form-shell__form">
          {selectedEntity && activeFamily === "plant" ? (
            <AssetForm
              asset={selectedEntity}
              assetTypes={assetTypes}
              issues={targetIssues}
              onPatch={applyPatch}
            />
          ) : null}
          {selectedEntity && activeFamily === "tag_map" ? (
            <TagForm
              tag={selectedEntity}
              assetOptions={assetOptions}
              issues={targetIssues}
              onPatch={applyPatch}
            />
          ) : null}
          {selectedEntity && activeFamily === "alarm_rules" ? (
            <AlarmRuleForm
              rule={selectedEntity}
              tagOptions={tagOptions}
              issues={targetIssues}
              onPatch={applyPatch}
            />
          ) : null}
          {selectedEntity && activeFamily === "causal_graph" ? (
            <CausalEdgeForm
              edge={selectedEntity}
              nodeOptions={nodeOptions}
              issues={targetIssues}
              onPatch={applyPatch}
            />
          ) : null}
          {selectedEntity && activeFamily === "action_envelope" ? (
            <ActionEnvelopeForm
              action={selectedEntity}
              assetOptions={assetOptions}
              issues={targetIssues}
              onPatch={applyPatch}
            />
          ) : null}
          {!selectedEntity ? (
            <p className="studio-form-field__hint">Select an entity from the list to edit the draft.</p>
          ) : null}
        </div>

        <ValidationPanel
          issues={issues}
          selectedFamily={activeFamily}
          selectedTargetId={activeTargetId}
          onSelectIssue={(issue) => {
            if (issue.targetId) selectTarget(issue.family, issue.targetId);
          }}
        />
      </div>

      <DisabledActionsFooter />
    </div>
  );
}

function DisabledActionsFooter() {
  return (
    <footer className="studio-disabled-actions">
      <button type="button" disabled title="Backend save is not wired in this prompt.">
        Save draft
      </button>
      <button type="button" disabled title="Approval workflow comes after draft persistence.">
        Submit for approval
      </button>
      <button
        type="button"
        disabled
        title="Open the Compile Preview tab to generate a local read-only preview."
      >
        Compile preview
      </button>
    </footer>
  );
}