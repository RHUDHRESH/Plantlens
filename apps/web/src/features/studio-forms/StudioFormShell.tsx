import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { Button, StatusBadge, Tooltip } from "../../components/ui/primitives";
import type { StatusKind } from "../../components/ui/primitives";
import type { StudioRouteState } from "../studio-launchpad/studioTypes";
import { ActionEnvelopeForm } from "./ActionEnvelopeForm";
import { AlarmRuleForm } from "./AlarmRuleForm";
import { AssetForm } from "./AssetForm";
import { CausalEdgeForm } from "./CausalEdgeForm";
import { EntityList } from "./EntityList";
import { TagForm } from "./TagForm";
import { ValidationPanel } from "./ValidationPanel";
import "./studio-forms.css";
import {
  entityIdFromRecord,
  entityLabelFromRecord,
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
  /** Extra toolbar actions (e.g. a link to the HMI preview) rendered next to Save/Submit. */
  toolbarActions?: ReactNode;
}

const STATUS_LABELS = {
  clean: "Clean",
  dirty: "Local edits not saved",
  invalid: "Invalid — fix errors before compile",
} as const;

const STATUS_KIND: Record<keyof typeof STATUS_LABELS, StatusKind> = {
  clean: "normal",
  dirty: "medium",
  invalid: "critical",
};

export const SAVE_UNAVAILABLE = "Saving drafts to the server is not available yet. Edits stay in this browser tab.";
export const SUBMIT_UNAVAILABLE = "Submitting for approval needs a saved draft. Use Plant Studio or the pattern library to propose changes today.";

function FormToolbar({ status, actions }: { status: keyof typeof STATUS_LABELS; actions?: ReactNode }) {
  return (
    <div className="sf-toolbar">
      <div className="sf-toolbar__status" role="status">
        <span className="sf-toolbar__label">Draft status:</span>
        <StatusBadge status={STATUS_KIND[status]} label={STATUS_LABELS[status]} compact />
      </div>
      <div className="sf-toolbar__actions">
        {actions}
        <Tooltip content={SAVE_UNAVAILABLE}>
          <span tabIndex={0} className="sf-toolbar__disabled">
            <Button size="sm" disabled title={SAVE_UNAVAILABLE}>
              Save draft
            </Button>
          </span>
        </Tooltip>
        <Tooltip content={SUBMIT_UNAVAILABLE}>
          <span tabIndex={0} className="sf-toolbar__disabled">
            <Button size="sm" disabled title={SUBMIT_UNAVAILABLE}>
              Submit for approval
            </Button>
          </span>
        </Tooltip>
      </div>
    </div>
  );
}

function familyFromRoute(route: StudioRouteState): StudioDraftFamily | null {
  return surfaceToFamily(route.surface);
}

export function StudioFormShell({ route, toolbarActions }: StudioFormShellProps) {
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

  // Pick the routed target (or the family's first entity) when the family or target changes.
  // Editing the draft must not reset the selection, so the bundle is read, not subscribed to.
  useEffect(() => {
    if (!family) return;
    if (route.targetId) {
      selectTarget(family, route.targetId);
      return;
    }
    const st = useStudioDraftStore.getState();
    if (st.selectedFamily === family && st.selectedTargetId) return;
    const first = selectEntitiesForFamily(st.bundle, family)[0];
    selectTarget(family, first ? entityIdFromRecord(family, first) : null);
  }, [family, route.targetId, loaded, selectTarget]);

  const activeFamily = family ?? selectedFamily;
  const activeTargetId =
    selectedFamily === activeFamily && selectedTargetId ? selectedTargetId : (route.targetId ?? selectedTargetId);

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
      <div className="sf-shell">
        <FormToolbar status={status} actions={toolbarActions} />
        <div className="sf-layout sf-layout--two">
          <section className="sf-editor" aria-label="Role views">
            <header className="sf-editor__head">
              <h2 className="sf-editor__title">Role views</h2>
            </header>
            <div className="sf-editor__body">
              <p className="sf-hint">
                The plant declares these roles. Each role sees the same situations with its own map layers and
                actions; per-role view authoring arrives with saved drafts.
              </p>
              <ul className="sf-roles">
                {roles.map((role) => (
                  <li key={role} className="pl-chip">
                    {role}
                  </li>
                ))}
              </ul>
            </div>
          </section>
          <ValidationPanel issues={issues} selectedFamily="plant" />
        </div>
      </div>
    );
  }

  if (!activeFamily) {
    return null;
  }

  return (
    <div className="sf-shell">
      <FormToolbar status={status} actions={toolbarActions} />

      <div className="sf-layout">
        <EntityList
          family={activeFamily}
          items={entities}
          selectedTargetId={activeTargetId}
          issues={familyIssues}
          familyDirty={dirtyFamilies[activeFamily]}
          onSelect={(id) => selectTarget(activeFamily, id)}
        />

        <section className="sf-editor" aria-label="Editor">
          <header className="sf-editor__head">
            <h2 className="sf-editor__title">{selectedEntity ? entityLabelFromRecord(activeFamily, selectedEntity) : "Nothing selected"}</h2>
            {activeTargetId ? <span className="sf-editor__id pl-mono">{activeTargetId}</span> : null}
          </header>
          <div className="sf-editor__body">
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
            <p className="sf-hint">Select an entity from the list to edit the draft.</p>
          ) : null}
          </div>
        </section>

        <ValidationPanel
          issues={issues}
          selectedFamily={activeFamily}
          selectedTargetId={activeTargetId}
          onSelectIssue={(issue) => {
            if (issue.targetId) selectTarget(issue.family, issue.targetId);
          }}
        />
      </div>
    </div>
  );
}