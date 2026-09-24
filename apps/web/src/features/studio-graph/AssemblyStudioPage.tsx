/**
 * Plant Studio (/eng/studio): palette · canvas · inspector. The assembly document is the source of
 * truth (R4); the canvas is its projection. New connections are drafts (R5) — approval happens in
 * Approvals, never here.
 */
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tabs from "@radix-ui/react-tabs";
import { useQuery } from "@tanstack/react-query";
import { ReactFlowProvider, type Viewport } from "@xyflow/react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  AlertTriangle,
  Check,
  CloudOff,
  Columns3,
  Focus,
  Grid3x3,
  Keyboard,
  Loader2,
  Lock,
  Maximize,
  Redo2,
  Rows3,
  ShieldCheck,
  Timer,
  Undo2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ENGINEER_ROLES, useCan, useSession } from "../../app/session";
import { Button, ErrorNotice, IconButton, Mono, PriorityGlyph, Tooltip } from "../../components/ui/primitives";
import { buildEngineContext, validateAssemblyRules } from "../connection-rules/engine";
import { RulesDialog } from "../connection-rules/RulesDialog";
import { isRulesDirty, useRulesStore } from "../connection-rules/rulesStore";
import type { RuleComponent } from "../connection-rules/types";
import { AnalysisPanel } from "./AnalysisPanel";
import { StudioCanvas } from "./canvas/StudioCanvas";
import { useStudioActions } from "./canvas/useStudioActions";
import { fetchComponentLibrary } from "./componentLibraryApi";
import { CATEGORY_LABELS } from "./componentLibraryTypes";
import { demoAssembly } from "./demoAssembly";
import { Inspector } from "./Inspector";
import { canRedo, canUndo, redoLabel, undoLabel } from "./model/history";
import { isMacPlatform } from "./model/shortcuts";
import { Palette } from "./Palette";
import { resolveConflict, setViewport, usePersistStore, useStudioPersistence } from "./persistence";
import { ShortcutHelp } from "./ShortcutHelp";
import { selectAssembly, useStudioStore } from "./studioStore";
import { ValidationPanel } from "./ValidationPanel";
import "../connection-rules/rules.css";
import "./studio.css";

const PLANT_ID = "demo_microgrid_001";

function SaveIndicator() {
  const status = usePersistStore((s) => s.status);
  const error = usePersistStore((s) => s.error);
  const map = {
    loading: { icon: <Loader2 className="st-spin" />, text: "Loading…" },
    saved: { icon: <Check />, text: "Saved" },
    dirty: { icon: <span className="st-dot-dirty" />, text: "Unsaved changes" },
    saving: { icon: <Loader2 className="st-spin" />, text: "Saving…" },
    error: { icon: <CloudOff />, text: "Not saved" },
    conflict: { icon: <AlertTriangle />, text: "Conflict" },
    readonly: { icon: <Lock />, text: "Read-only" },
  } as const;
  const s = map[status];
  return (
    <Tooltip content={status === "error" ? `${error?.message ?? "Save failed"}${error?.fix ? ` — ${error.fix}` : ""}` : "Changes save automatically"}>
      <span className="st-save" data-status={status} role="status" aria-live="polite" tabIndex={0}>
        {s.icon}
        {s.text}
      </span>
    </Tooltip>
  );
}

function ConflictBanner() {
  const conflict = usePersistStore((s) => s.conflict);
  const blocked = usePersistStore((s) => s.blocked);
  if (!conflict && !blocked) return null;
  return (
    <div className="st-banner" role="alert">
      <AlertTriangle aria-hidden />
      {conflict ? (
        <span>
          <strong>The {conflict.doc} was changed elsewhere</strong> (now revision <Mono>{conflict.currentRevision ?? "?"}</Mono>). Autosave is paused.
        </span>
      ) : (
        <span>
          <strong>{blocked}</strong> Autosave is paused so it is not overwritten.
        </span>
      )}
      <Button size="sm" onClick={() => void resolveConflict(PLANT_ID, "reload")}>
        Reload
      </Button>
      <Button size="sm" variant="danger" onClick={() => void resolveConflict(PLANT_ID, "overwrite")}>
        Overwrite
      </Button>
    </div>
  );
}

function NoticeToast() {
  const notice = useStudioStore((s) => s.notice);
  const dismiss = useStudioStore((s) => s.dismissNotice);
  useEffect(() => {
    if (!notice || notice.tone === "error") return;
    const t = setTimeout(dismiss, notice.tone === "warn" ? 7000 : 3500);
    return () => clearTimeout(t);
  }, [notice, dismiss]);
  useEffect(() => {
    if (!notice || notice.tone !== "error") return;
    const t = setTimeout(dismiss, 9000);
    return () => clearTimeout(t);
  }, [notice, dismiss]);
  if (!notice) return null;
  return (
    <div className="st-toast" data-tone={notice.tone} role={notice.tone === "error" ? "alert" : "status"} key={notice.id}>
      {notice.tone === "info" ? null : <PriorityGlyph status={notice.tone === "error" ? "critical" : "medium"} size={12} />}
      <span className="st-toast__text">
        <span>{notice.message}</span>
        {notice.fix ? <span className="st-toast__fix">Fix: {notice.fix}</span> : null}
      </span>
      <IconButton size="sm" label="Dismiss" icon={<X />} onClick={dismiss} />
    </div>
  );
}

function StudioWorkspace() {
  const canEdit = useCan(ENGINEER_ROLES);
  const sessionReady = useSession((s) => s.status === "ready");
  const readOnly = !canEdit;
  const actions = useStudioActions();
  const [helpOpen, setHelpOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rightTab, setRightTab] = useState<"inspect" | "validate" | "analyse">("inspect");

  useStudioPersistence(PLANT_ID, sessionReady, canEdit);

  const libraryQuery = useQuery({
    queryKey: ["component-library"],
    queryFn: ({ signal }) => fetchComponentLibrary(signal),
    enabled: sessionReady,
    staleTime: 5 * 60_000,
  });
  const setLibrary = useStudioStore((s) => s.setLibrary);
  useEffect(() => {
    if (libraryQuery.data?.components) setLibrary(libraryQuery.data.components);
  }, [libraryQuery.data, setLibrary]);

  const assembly = useStudioStore(selectAssembly);
  const templates = useStudioStore((s) => s.templates);
  const history = useStudioStore((s) => s.history);
  const selection = useStudioStore((s) => s.selection);
  const snapEnabled = useStudioStore((s) => s.snapEnabled);
  const showLagLabels = useStudioStore((s) => s.showLagLabels);
  const draggingTemplateId = useStudioStore((s) => s.draggingTemplateId);
  const rules = useRulesStore((s) => s.rules);
  const rulesDirty = useRulesStore((s) => isRulesDirty(s));
  const persistLoaded = usePersistStore((s) => s.loaded);
  const initialViewport = usePersistStore((s) => s.viewport);

  const ctx = useMemo(() => buildEngineContext(assembly, templates as unknown as Map<string, RuleComponent>), [assembly, templates]);
  const issues = useMemo(() => (templates.size ? validateAssemblyRules(ctx, rules) : []), [ctx, rules, templates.size]);
  const denyCount = issues.filter((i) => i.severity === "deny").length;
  const components = libraryQuery.data?.components ?? [];

  const onViewportChange = useCallback((vp: Viewport) => setViewport(PLANT_ID, vp, canEdit), [canEdit]);

  // Selecting something brings the inspector forward; the validation tab stays if the user chose it.
  useEffect(() => {
    if ((selection.nodes.length || selection.edges.length) && rightTab === "analyse") setRightTab("inspect");
  }, [selection, rightTab]);

  const mod = isMacPlatform() ? "⌘" : "Ctrl";
  const u = undoLabel(history);
  const r = redoLabel(history);
  const multi = selection.nodes.length > 1;

  return (
    <div className="st-studio" data-readonly={readOnly || undefined}>
      <header className="st-toolbar" aria-label="Studio toolbar">
        <div className="st-toolbar__title">
          <h1>Plant Studio</h1>
          <Mono className="st-toolbar__plant">{assembly.plant_id}</Mono>
          <SaveIndicator />
        </div>
        <div className="st-toolbar__group" role="group" aria-label="History">
          <IconButton label={u ? `Undo ${u} (${mod} Z)` : "Nothing to undo"} icon={<Undo2 />} disabled={readOnly || !canUndo(history)} onClick={() => useStudioStore.getState().undo()} />
          <IconButton label={r ? `Redo ${r} (${mod} ⇧ Z)` : "Nothing to redo"} icon={<Redo2 />} disabled={readOnly || !canRedo(history)} onClick={() => useStudioStore.getState().redo()} />
        </div>
        <span className="st-toolbar__divider" />
        <div className="st-toolbar__group" role="group" aria-label="Layout">
          <IconButton
            label={`Snap to 16 px grid: ${snapEnabled ? "on" : "off"} (G, hold Alt to bypass)`}
            icon={<Grid3x3 />}
            aria-pressed={snapEnabled}
            onClick={() => useStudioStore.getState().setSnapEnabled(!snapEnabled)}
          />
          <IconButton
            label={`Lag windows on connections: ${showLagLabels ? "shown" : "hidden"}`}
            icon={<Timer />}
            aria-pressed={showLagLabels}
            onClick={() => useStudioStore.getState().setShowLagLabels(!showLagLabels)}
          />
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild disabled={!multi || readOnly}>
              <IconButton label={multi ? "Align and distribute" : "Align (select 2 or more)"} icon={<AlignStartVertical />} disabled={!multi || readOnly} />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="pl-menu" sideOffset={6} align="start">
                <DropdownMenu.Label className="pl-menu__label">Align {selection.nodes.length}</DropdownMenu.Label>
                <DropdownMenu.Item className="pl-menu__item" onSelect={() => actions.align("left")}><AlignStartVertical />Left</DropdownMenu.Item>
                <DropdownMenu.Item className="pl-menu__item" onSelect={() => actions.align("hcenter")}><AlignCenterVertical />Centre</DropdownMenu.Item>
                <DropdownMenu.Item className="pl-menu__item" onSelect={() => actions.align("right")}><AlignEndVertical />Right</DropdownMenu.Item>
                <DropdownMenu.Item className="pl-menu__item" onSelect={() => actions.align("top")}><AlignStartHorizontal />Top</DropdownMenu.Item>
                <DropdownMenu.Item className="pl-menu__item" onSelect={() => actions.align("vcenter")}><AlignCenterHorizontal />Middle</DropdownMenu.Item>
                <DropdownMenu.Item className="pl-menu__item" onSelect={() => actions.align("bottom")}><AlignEndHorizontal />Bottom</DropdownMenu.Item>
                <DropdownMenu.Separator className="pl-menu__sep" />
                <DropdownMenu.Item className="pl-menu__item" disabled={selection.nodes.length < 3} onSelect={() => actions.distribute("horizontal")}><Columns3 />Distribute horizontally</DropdownMenu.Item>
                <DropdownMenu.Item className="pl-menu__item" disabled={selection.nodes.length < 3} onSelect={() => actions.distribute("vertical")}><Rows3 />Distribute vertically</DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
        <span className="st-toolbar__divider" />
        <div className="st-toolbar__group" role="group" aria-label="View">
          <IconButton label="Fit view (⇧ 1)" icon={<Maximize />} onClick={() => actions.fitView()} />
          <IconButton label="Zoom to selection (⇧ 2)" icon={<Focus />} disabled={!selection.nodes.length && !selection.edges.length} onClick={() => actions.zoomToSelection()} />
        </div>
        <span className="st-toolbar__spacer" />
        <Button
          size="sm"
          variant="ghost"
          className="st-validate-btn"
          data-has-issues={issues.length ? true : undefined}
          onClick={() => setRightTab("validate")}
          icon={issues.length ? <PriorityGlyph status={denyCount ? "critical" : "medium"} size={11} /> : <Check />}
        >
          {issues.length ? `${issues.length} finding${issues.length === 1 ? "" : "s"}` : "Valid"}
        </Button>
        <Button size="sm" icon={<ShieldCheck />} onClick={() => setRulesOpen(true)}>
          Rules{rulesDirty ? " •" : ""}
        </Button>
        <IconButton label="Keyboard shortcuts (?)" icon={<Keyboard />} onClick={() => setHelpOpen(true)} />
      </header>

      <div className="st-body">
        {libraryQuery.error ? (
          <div className="st-palette">
            <ErrorNotice error={libraryQuery.error} />
          </div>
        ) : (
          <Palette components={components} readOnly={readOnly} onAdd={(id) => void actions.addAtCenter(id)} />
        )}
        <main className="st-center" aria-label="Assembly canvas">
          <ConflictBanner />
          {persistLoaded ? (
            <StudioCanvas
              issues={issues}
              readOnly={readOnly}
              onOpenHelp={() => setHelpOpen(true)}
              onViewportChange={onViewportChange}
              defaultViewport={initialViewport}
            />
          ) : (
            <div className="st-canvas st-canvas--loading" role="status">
              <Loader2 className="st-spin" aria-hidden /> Loading assembly…
            </div>
          )}
          {persistLoaded && !assembly.assets.length && canEdit && templates.size && !draggingTemplateId ? (
            <div className="st-demo-offer">
              <Button size="sm" variant="ghost" onClick={() => useStudioStore.getState().commit("Load demo assembly", () => demoAssembly(PLANT_ID))}>
                Or load the motor–fan–blower demo
              </Button>
            </div>
          ) : null}
          <NoticeToast />
        </main>
        <aside className="st-right" aria-label="Details">
          <Tabs.Root value={rightTab} onValueChange={(v) => setRightTab(v as typeof rightTab)} className="st-right__tabs">
            <Tabs.List className="st-right__tablist" aria-label="Details panels">
              <Tabs.Trigger value="inspect" className="st-right__tab">
                Inspector
              </Tabs.Trigger>
              <Tabs.Trigger value="validate" className="st-right__tab">
                Validation
                {issues.length ? (
                  <span className="st-right__count" data-severity={denyCount ? "deny" : "warn"}>
                    {issues.length}
                  </span>
                ) : null}
              </Tabs.Trigger>
              <Tabs.Trigger value="analyse" className="st-right__tab">
                Analysis
              </Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="inspect" className="st-right__panel">
              <Inspector ctx={ctx} issues={issues} readOnly={readOnly} actions={actions} />
            </Tabs.Content>
            <Tabs.Content value="validate" className="st-right__panel">
              <ValidationPanel issues={issues} actions={actions} />
            </Tabs.Content>
            <Tabs.Content value="analyse" className="st-right__panel">
              <AnalysisPanel />
            </Tabs.Content>
          </Tabs.Root>
        </aside>
      </div>

      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />
      <RulesDialog
        open={rulesOpen}
        onOpenChange={setRulesOpen}
        plantId={PLANT_ID}
        ctx={ctx}
        components={components as unknown as RuleComponent[]}
        categoryLabels={CATEGORY_LABELS}
        canEdit={canEdit}
      />
    </div>
  );
}

export function AssemblyStudioPage() {
  return (
    <div className="pl-page pl-page--full">
      <ReactFlowProvider>
        <StudioWorkspace />
      </ReactFlowProvider>
    </div>
  );
}
