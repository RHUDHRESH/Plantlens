import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  escalateIncident,
  getCompiledBundle,
  getRuntimeSnapshot,
  issueDevToken,
} from "../../api/client";
import { setAuthToken } from "../../api/config";
import { getRuntimeHmiState, isRuntimeEndpointUnavailable } from "../../api/hmi";
import { connectRuntimeSocket } from "../../api/ws";
import { useReducedMotion } from "../../app/hooks/useReducedMotion";
import { useWebGLAvailable } from "../../app/hooks/useWebGL";
import { useRuntimeStore } from "../../app/store/runtime";
import { RuntimeTopStrip } from "../../components/shell/RuntimeTopStrip";
import { AgentConsole } from "../agents/AgentConsole";
import { CalmCard, NoActiveSituation } from "../calm-card/CalmCard";
import { HmiStatePanel } from "../hmi-state/HmiStatePanel";
import {
  buildHmiAssetStatusMap,
  formatOverallStatus,
  getActiveCausalityAssetPath,
  getPrimaryRootAssetId,
} from "../hmi-state/hmiFormatting";
import { RawAlarmTable } from "../alarms/RawAlarmTable";
import { IncidentRoom } from "../incidents/IncidentRoom";
import { AssetDetailDrawer } from "../maps2d/AssetDetailDrawer";
import type { MapNode } from "../maps2d/mapTypes";
import { LazyPlantMap3D } from "../maps3d/LazyPlantMap3D";
import type { PlantMap3DViewportControls } from "../maps3d/PlantMap3D";
import { adaptMap3DViewModel } from "../ops3d/adapters";
import { ScenarioLauncher } from "../scenarios/ScenarioLauncher";
import { buildCausalPathViewModel } from "../causal-path";
import {
  selectCausalPathVisible,
  useOperationalMapStore,
  type MapZoomBand,
} from "../operational-map";
import {
  buildExecuteCommandParams,
  buildOperationalSearchIndex,
  CommandPalette,
  executeOperationalSearchResult,
  scoreOperationalSearch,
  useCommandPalette,
} from "../operational-search";
import { buildAssetSourceLineage } from "../source-lineage";
import { selectAuthoredBundleInput, useStudioDraftStore } from "../studio-forms";
import { StudioLaunchpad, useStudioRoute } from "../studio-launchpad";
import { AppIconRail, type AppScreen } from "../../components/shell/AppIconRail";
import { AtlasScreen } from "../atlas";
import { ConnectionScreen } from "../connection";
import { useAtlasStore } from "../../app/store/atlas";

function derivePlantHealth(assetStatus: Record<string, string>): string {
  const values = Object.values(assetStatus);
  if (!values.length) return "Unknown";
  if (values.some((s) => s === "critical")) return "Critical";
  if (values.some((s) => s === "warning")) return "Warning";
  if (values.some((s) => s === "sensor_bad")) return "Sensor fault";
  return "Normal";
}

export function RuntimeHMI() {
  const reducedMotion = useReducedMotion();
  const webglAvailable = useWebGLAvailable();
  const socketRef = useRef<ReturnType<typeof connectRuntimeSocket> | null>(null);

  const [screen, setScreen] = useState<AppScreen>("atlas");
  const [rawExpanded, setRawExpanded] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const [agentOpen, setAgentOpen] = useState(false);
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [showLegend, setShowLegend] = useState(true);
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [map3dControls, setMap3dControls] = useState<PlantMap3DViewportControls | null>(null);

  const mapMode = useOperationalMapStore((s) => s.mode);
  const zoomBand = useOperationalMapStore((s) => s.zoomBand);
  const mapRole = useOperationalMapStore((s) => s.role);
  const selectedAssetId = useOperationalMapStore((s) => s.selectedAssetId);
  const focusAssetId = useOperationalMapStore((s) => s.focusedAssetId);
  const visibleLayers = useOperationalMapStore((s) => s.visibleLayers);
  const setMapMode = useOperationalMapStore((s) => s.setMode);
  const setMapRole = useOperationalMapStore((s) => s.setRole);
  const selectAsset = useOperationalMapStore((s) => s.selectAsset);
  const focusAsset = useOperationalMapStore((s) => s.focusAsset);
  const clearSelection = useOperationalMapStore((s) => s.clearSelection);
  const setActiveSituationLocked = useOperationalMapStore((s) => s.setActiveSituationLocked);
  const dispatchMapCommand = useOperationalMapStore((s) => s.dispatchMapCommand);
  const setZoomBand = useOperationalMapStore((s) => s.setZoomBand);
  const showCausalPath = useOperationalMapStore(selectCausalPathVisible);
  const connection = useRuntimeStore((s) => s.connection);
  const assetStatus = useRuntimeStore((s) => s.assetStatus);
  const calmCard = useRuntimeStore((s) => s.calmCard);
  const activeSituation = useRuntimeStore((s) => s.activeSituation);
  const activeAlarms = useRuntimeStore((s) => s.activeAlarms);
  const tags = useRuntimeStore((s) => s.tags);
  const lastSnapshotTs = useRuntimeStore((s) => s.lastSnapshotTs);
  const scenarioState = useRuntimeStore((s) => s.scenarioState);
  const hmiState = useRuntimeStore((s) => s.hmiState);
  const lastHmiStateTs = useRuntimeStore((s) => s.lastHmiStateTs);

  const hmiStateQuery = useQuery({
    queryKey: ["hmi-runtime-state"],
    queryFn: ({ signal }) => getRuntimeHmiState(signal),
    enabled: authReady,
    refetchInterval: 1500,
    retry: 1,
  });

  const runtimeSnapshotQuery = useQuery({
    queryKey: ["runtime-snapshot"],
    queryFn: ({ signal }) => getRuntimeSnapshot(signal),
    enabled: authReady,
    refetchInterval: 1000,
    retry: 1,
  });

  const compiledQuery = useQuery({
    queryKey: ["compiled-bundle"],
    queryFn: ({ signal }) => getCompiledBundle(signal),
    enabled: authReady,
    retry: 1,
  });

  const escalateMutation = useMutation({
    mutationFn: () => {
      if (!calmCard || !activeSituation) {
        return Promise.reject(new Error("No active situation"));
      }
      return escalateIncident({
        calm_card: calmCard as unknown as Record<string, unknown>,
        situation: activeSituation as unknown as Record<string, unknown>,
        raw_alarms: activeAlarms,
      });
    },
    onSuccess: (data) => setIncidentId(data.incident.incident_id),
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await issueDevToken("operator");
        if (!cancelled) {
          setAuthToken(token);
          setAuthReady(true);
        }
      } catch {
        if (!cancelled) setAuthReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authReady) return;
    socketRef.current = connectRuntimeSocket();
    return () => {
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [authReady]);

  useEffect(() => {
    if (hmiStateQuery.data) {
      useRuntimeStore.getState().applyHmiState(hmiStateQuery.data, hmiStateQuery.data.generated_at);
    }
  }, [hmiStateQuery.data]);

  useEffect(() => {
    if (runtimeSnapshotQuery.data) {
      useRuntimeStore.getState().applySnapshot(runtimeSnapshotQuery.data);
    }
  }, [runtimeSnapshotQuery.data]);

  const palette = useCommandPalette();
  const studio = useStudioRoute();
  const studioDraftLoaded = useStudioDraftStore((s) => s.loaded);
  const studioDraftBundle = useStudioDraftStore((s) => s.bundle);
  const loadStudioDraft = useStudioDraftStore((s) => s.loadInitialBundle);

  useEffect(() => {
    if (studio.open && !studioDraftLoaded) {
      loadStudioDraft();
    }
  }, [studio.open, studioDraftLoaded, loadStudioDraft]);

  const studioAuthoredBundle = useMemo(() => {
    if (!studioDraftLoaded) return null;
    return selectAuthoredBundleInput(studioDraftBundle);
  }, [studioDraftLoaded, studioDraftBundle]);

  const hmi = compiledQuery.data?.hmi_view_model;
  const nodes2d = hmi?.map_2d?.nodes ?? [];
  const map3d = useMemo(() => adaptMap3DViewModel(hmi?.map_3d), [hmi?.map_3d]);
  const nodes3d = map3d.nodes;
  const edges3d = map3d.edges;
  const plantName = compiledQuery.data?.plant_id?.replace(/_/g, " ") ?? "PlantLens Demo";
  const hmiProjectionContradictsLive = useMemo(() => {
    const missingSignals = hmiState?.data_quality?.missing_signals ?? [];
    if (!missingSignals.length) return false;
    const liveTagIds = new Set(Object.keys(tags));
    if (!liveTagIds.size) return false;
    const missingButLive = missingSignals.filter((tagId) => liveTagIds.has(tagId));
    return missingButLive.length >= Math.max(3, Math.ceil(missingSignals.length * 0.5));
  }, [hmiState?.data_quality?.missing_signals, tags]);
  const displayHmiState = hmiProjectionContradictsLive ? null : hmiState;
  const hmiRootAssetId = useMemo(() => getPrimaryRootAssetId(displayHmiState), [displayHmiState]);

  const hasActiveSituation = Boolean(hmiRootAssetId ?? activeSituation?.root_asset_id);

  useEffect(() => {
    if (useOperationalMapStore.getState().activeSituationLocked !== hasActiveSituation) {
      setActiveSituationLocked(hasActiveSituation);
    }
  }, [hasActiveSituation, setActiveSituationLocked]);

  useEffect(() => {
    const nextRoot = hmiRootAssetId ?? activeSituation?.root_asset_id ?? null;
    if (nextRoot && useOperationalMapStore.getState().focusedAssetId !== nextRoot) {
      focusAsset(nextRoot);
    }
  }, [hmiRootAssetId, activeSituation?.root_asset_id, focusAsset]);

  const hmiAssetStatus = useMemo(() => buildHmiAssetStatusMap(displayHmiState), [displayHmiState]);
  const effectiveAssetStatus = useMemo(
    () => (Object.keys(hmiAssetStatus).length ? hmiAssetStatus : assetStatus),
    [hmiAssetStatus, assetStatus],
  );

  const hmiCausalPath = useMemo(() => getActiveCausalityAssetPath(displayHmiState), [displayHmiState]);
  const causalPath = showCausalPath
    ? hmiCausalPath.length
      ? hmiCausalPath
      : (activeSituation?.causal_path ?? [])
    : [];

  const plantHealth = useMemo(
    () => (displayHmiState ? formatOverallStatus(displayHmiState.overall_status) : derivePlantHealth(assetStatus)),
    [displayHmiState, assetStatus],
  );
  const timeLabel = lastHmiStateTs ?? lastSnapshotTs ?? "—";
  const dataSource = displayHmiState ? "HMI Projection" : "Live Snapshot";
  const hmiRuntimeError = useMemo(() => {
    if (hmiProjectionContradictsLive) {
      return "HMI projection disagrees with live gateway tags. Showing verified live snapshot.";
    }
    if (!hmiStateQuery.isError) return null;
    const error = hmiStateQuery.error;
    if (isRuntimeEndpointUnavailable(error)) {
      return "HMI runtime projection unavailable. Showing WebSocket snapshot fallback.";
    }
    if (error instanceof Error) return error.message;
    return "HMI runtime projection unavailable. Showing WebSocket snapshot fallback.";
  }, [hmiProjectionContradictsLive, hmiStateQuery.isError, hmiStateQuery.error]);

  const rootAssetId = hmiRootAssetId ?? activeSituation?.root_asset_id ?? null;
  const affectedAssetIds =
    displayHmiState?.active_incident?.affected_assets?.length
      ? displayHmiState.active_incident.affected_assets
      : (activeSituation?.affected_asset_ids ?? []);

  const selectedNode: MapNode | null = useMemo(
    () => nodes2d.find((n) => n.id === selectedAssetId) ?? null,
    [nodes2d, selectedAssetId],
  );

  const selectedAssetLineage = useMemo(() => {
    if (!selectedAssetId) return null;
    return buildAssetSourceLineage({
      assetId: selectedAssetId,
      nodes2d,
      nodes3d,
      tags,
      alarms: activeAlarms,
      activeSituation: activeSituation ?? null,
      calmCard: calmCard ?? null,
      compiledBundle: compiledQuery.data ?? undefined,
      ...(studioAuthoredBundle ? { authoredBundle: studioAuthoredBundle } : {}),
    });
  }, [
    selectedAssetId,
    nodes2d,
    nodes3d,
    tags,
    activeAlarms,
    activeSituation,
    calmCard,
    compiledQuery.data,
    studioAuthoredBundle,
  ]);

  const showStudio = mapRole === "engineer" || mapRole === "maintenance";

  const handleSelectAsset = useCallback(
    (id: string) => {
      selectAsset(id);
    },
    [selectAsset],
  );

  const handleHighlightAsset = useCallback(
    (id: string) => {
      focusAsset(id);
    },
    [focusAsset],
  );

  const handleFocusRoot = useCallback(() => {
    if (rootAssetId) {
      dispatchMapCommand({ type: "focus_root" });
      focusAsset(rootAssetId);
      useAtlasStore.getState().selectEquipment(rootAssetId);
      if (mapMode === "3d") {
        map3dControls?.focusRoot();
      }
    }
  }, [rootAssetId, dispatchMapCommand, focusAsset, mapMode, map3dControls]);

  const handleFitPlant = useCallback(() => {
    dispatchMapCommand({ type: "fit_plant" });
    if (mapMode === "3d") {
      map3dControls?.fitPlant();
    } else {
      useAtlasStore.getState().resetZoom();
    }
  }, [dispatchMapCommand, mapMode, map3dControls]);

  const handleZoomBandChange = useCallback(
    (band: MapZoomBand) => {
      setZoomBand(band);
    },
    [setZoomBand],
  );

  const causalPathViewModel = useMemo(
    () =>
      buildCausalPathViewModel({
        nodes: nodes2d,
        assetStatus: effectiveAssetStatus,
        pathAssetIds: causalPath,
        affectedAssetIds,
        selectedAssetId,
        focusedAssetId: focusAssetId,
        tags,
        alarms: activeAlarms,
        activeSituation,
        calmCard,
      }),
    [
      nodes2d,
      effectiveAssetStatus,
      causalPath,
      affectedAssetIds,
      selectedAssetId,
      focusAssetId,
      tags,
      activeAlarms,
      activeSituation,
      calmCard,
    ],
  );

  const searchIndex = useMemo(
    () =>
      buildOperationalSearchIndex({
        nodes: nodes2d,
        assetStatus: effectiveAssetStatus,
        tags,
        alarms: activeAlarms,
        causalPathViewModel,
        role: mapRole,
        visibleLayers,
        rootAssetId,
        mapMode,
        showLegend,
        density,
      }),
    [
      nodes2d,
      effectiveAssetStatus,
      tags,
      activeAlarms,
      causalPathViewModel,
      mapRole,
      visibleLayers,
      rootAssetId,
      mapMode,
      showLegend,
      density,
    ],
  );

  const searchResults = useMemo(
    () => scoreOperationalSearch(searchIndex, palette.query, { role: mapRole, limit: 20 }),
    [searchIndex, palette.query, mapRole],
  );

  const commandParams = useMemo(
    () =>
      buildExecuteCommandParams({
        role: mapRole,
        mapMode,
        showLegend,
        density,
        rootAssetId,
        alarmCount: activeAlarms.length,
        visibleLayers,
      }),
    [mapRole, mapMode, showLegend, density, rootAssetId, activeAlarms.length, visibleLayers],
  );

  const searchActionContext = useMemo(
    () => ({
      selectAsset: (assetId: string) => {
        selectAsset(assetId);
      },
      focusAsset: (assetId: string) => {
        focusAsset(assetId);
        useAtlasStore.getState().selectEquipment(assetId);
        if (mapMode === "3d") {
          map3dControls?.focusAsset(assetId);
        }
      },
      fitPlant: handleFitPlant,
      focusRoot: handleFocusRoot,
      openRawAlarms: () => setRawExpanded(true),
      setMapMode: (mode: "2d" | "3d") => setMapMode(mode),
      setRole: (role: "operator" | "engineer" | "maintenance" | "manager") => setMapRole(role),
      toggleLegend: () => setShowLegend((v) => !v),
      toggleCompactDensity: () =>
        setDensity((d) => (d === "compact" ? "comfortable" : "compact")),
      openStudioOverview: () => studio.openOverview(),
    }),
    [
      selectAsset,
      focusAsset,
      map3dControls,
      mapMode,
      handleFitPlant,
      handleFocusRoot,
      setMapMode,
      setMapRole,
      studio.openOverview,
    ],
  );

  const handleExecuteSearchResult = useCallback(
    (result: (typeof searchResults)[number]) => {
      executeOperationalSearchResult({
        result,
        context: searchActionContext,
        commandParams,
      });
      palette.closePalette();
    },
    [searchActionContext, commandParams, palette],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (palette.open) {
        palette.closePalette();
        return;
      }
      if (selectedAssetId) {
        clearSelection();
        return;
      }
      if (scenarioOpen) setScenarioOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedAssetId, scenarioOpen, clearSelection, palette]);

  const map3dProps = {
    nodes: nodes3d,
    edges: edges3d,
    assetStatus: effectiveAssetStatus,
    causalPath,
    rootAssetId,
    selectedAssetId,
    focusAssetId,
    role: mapRole,
    zoomBand,
    visibleLayers,
    reducedMotion,
    onSelectAsset: handleSelectAsset,
    onViewportReady: setMap3dControls,
    onZoomBandChange: handleZoomBandChange,
  };

  const hasMap3d = nodes3d.length > 0;

  const handleNavScreen = useCallback(
    (next: AppScreen) => {
      setScreen(next);
      if (next === "twin" && mapMode !== "3d") setMapMode("3d");
      if (next === "atlas" && mapMode === "3d") setMapMode("2d");
    },
    [mapMode, setMapMode],
  );

  return (
    <div className={`runtime-hmi operator-shell${density === "compact" ? " runtime-hmi--compact" : ""}`}>
      <AppIconRail
        screen={screen}
        alarmCount={activeAlarms.length}
        hasActiveEvent={Boolean(hasActiveSituation)}
        onNav={handleNavScreen}
        onOpenStudio={studio.openOverview}
        reducedMotion={reducedMotion}
      />

      <div className="runtime-hmi__body">

      <RuntimeTopStrip
        plantName={plantName}
        plantHealth={plantHealth}
        mode="Runtime"
        dataSource={dataSource}
        timeLabel={timeLabel}
        role={mapRole}
        connection={connection}
        apiAvailable={!compiledQuery.isError}
        scenarioId={scenarioState.scenarioId}
        scenarioStatus={scenarioState.status}
        onRoleChange={setMapRole}
        onOpenAgents={() => setAgentOpen(true)}
        onOpenScenarios={() => setScenarioOpen((v) => !v)}
        onOpenSearch={palette.openPalette}
        showStudio={showStudio}
        onOpenStudio={studio.openOverview}
      />

      {/* ── ATLAS screen ── */}
      <ScreenWrap active={screen === "atlas"} className="runtime-hmi__atlas flex flex-1 min-h-0 flex-col relative">
        <AtlasScreen
          tags={tags}
          assetStatus={effectiveAssetStatus}
          activeSituation={activeSituation}
          situations={activeSituation ? [activeSituation] : []}
          calmCard={calmCard}
          alarms={activeAlarms}
          reducedMotion={reducedMotion}
          plantHealthy={!hasActiveSituation && plantHealth === "Normal"}
          onSelectEquipment={(id) => {
            handleSelectAsset(id);
            focusAsset(id);
            useAtlasStore.getState().selectEquipment(id);
          }}
          onViewRawAlarms={() => setRawExpanded(true)}
          onEscalate={() => escalateMutation.mutate()}
          onHighlightAsset={handleHighlightAsset}
          onFocusRoot={handleFocusRoot}
          escalating={escalateMutation.isPending}
          rawAlarmTable={
            <RawAlarmTable
              alarms={activeAlarms}
              situationTitle={activeSituation?.title ?? null}
              defaultExpanded={rawExpanded}
              onExpandedChange={setRawExpanded}
            />
          }
        />
        {scenarioOpen && (
          <div className="runtime-hmi__scenario-panel runtime-hmi__scenario-panel--atlas">
            <ScenarioLauncher onClose={() => setScenarioOpen(false)} />
          </div>
        )}
      </ScreenWrap>

      {/* ── CONNECTION screen ── */}
      <ScreenWrap active={screen === "connection"} className="runtime-hmi__connection flex flex-1 min-h-0 flex-col">
        <ConnectionScreen
          runtimeConnection={connection}
          runtimeTags={tags}
          runtimeLastSnapshotTs={lastSnapshotTs}
          onOpenAtlas={(assetId) => {
            setScreen("atlas");
            if (assetId) {
              selectAsset(assetId);
              focusAsset(assetId);
              useAtlasStore.getState().selectEquipment(assetId);
            }
          }}
        />
      </ScreenWrap>

      {/* ── ALARMS screen ── */}
      <ScreenWrap active={screen === "alarms"}>
        <div className="runtime-hmi__fullscreen-panel">
          <div className="runtime-hmi__fullscreen-header">
            <span className="runtime-hmi__screen-title">Active Alarms</span>
            <span className="runtime-hmi__screen-count">{activeAlarms.length} active</span>
          </div>
          <RawAlarmTable
            alarms={activeAlarms}
            situationTitle={activeSituation?.title ?? null}
            defaultExpanded
            onExpandedChange={() => undefined}
          />
        </div>
      </ScreenWrap>

      {/* ── EVENT screen ── */}
      <ScreenWrap active={screen === "event"}>
        <div className="runtime-hmi__fullscreen-panel runtime-hmi__event-panel">
          {displayHmiState ? (
            <HmiStatePanel
              state={displayHmiState}
              runtimeError={hmiRuntimeError}
              onViewRawAlarms={() => { setRawExpanded(true); setScreen("alarms"); }}
              onHighlightAsset={handleHighlightAsset}
            />
          ) : calmCard ? (
            <CalmCard
              card={calmCard}
              onViewRawAlarms={() => { setRawExpanded(true); setScreen("alarms"); }}
              onEscalate={() => escalateMutation.mutate()}
              onHighlightAsset={handleHighlightAsset}
              onFocusRoot={handleFocusRoot}
              escalating={escalateMutation.isPending}
            />
          ) : (
            <NoActiveSituation />
          )}
        </div>
      </ScreenWrap>

      {/* ── TWIN screen ── */}
      <ScreenWrap active={screen === "twin"}>
        <div className="runtime-hmi__twin-screen">
          {hasMap3d ? (
            <LazyPlantMap3D
              {...map3dProps}
              webglAvailable={webglAvailable}
              onSwitch2D={() => { setMapMode("2d"); setScreen("atlas"); }}
            />
          ) : (
            <div className="pl-empty-state" role="status">
              No 3D model available — compile the plant bundle first.
            </div>
          )}
        </div>
      </ScreenWrap>

      {/* ── ACTIONS screen ── */}
      <ScreenWrap active={screen === "actions"}>
        <div className="runtime-hmi__fullscreen-panel runtime-hmi__actions-panel">
          <div className="runtime-hmi__fullscreen-header">
            <span className="runtime-hmi__screen-title">Operator Actions</span>
          </div>
          {displayHmiState?.operator_actions?.length ? (
            <div className="runtime-hmi__actions-inner">
              <HmiStatePanel
                state={displayHmiState}
                runtimeError={null}
                onViewRawAlarms={() => setScreen("alarms")}
                onHighlightAsset={(id) => { handleHighlightAsset(id); setScreen("atlas"); }}
              />
            </div>
          ) : (
            <div className="pl-empty-state" role="status">
              No pending operator actions.
            </div>
          )}
        </div>
      </ScreenWrap>

      </div>{/* end runtime-hmi__body */}

      <AssetDetailDrawer
        node={selectedNode}
        status={selectedNode ? (effectiveAssetStatus[selectedNode.id] ?? "unknown") : "unknown"}
        role={mapRole}
        zoomBand={zoomBand}
        visibleLayers={visibleLayers}
        rootAssetId={rootAssetId}
        affectedAssetIds={affectedAssetIds}
        tags={tags}
        alarms={activeAlarms}
        calmCard={calmCard}
        activeSituation={activeSituation}
        open={Boolean(selectedNode)}
        onClose={clearSelection}
        onFocusMap={focusAsset}
        onViewRawAlarms={() => setRawExpanded(true)}
        sourceLineage={selectedAssetLineage}
        onOpenStudio={studio.openStudio}
      />

      <CommandPalette
        open={palette.open}
        query={palette.query}
        activeIndex={palette.activeIndex}
        results={searchResults}
        onQueryChange={palette.setQuery}
        onClose={palette.closePalette}
        onMoveActive={(delta) => palette.moveActive(delta, searchResults.length)}
        onExecuteResult={handleExecuteSearchResult}
        onSetActiveIndex={palette.setActiveIndex}
      />

      <StudioLaunchpad
        open={studio.open}
        route={studio.route}
        onClose={studio.closeStudio}
        compiledBundle={compiledQuery.data}
      />

      {incidentId && <IncidentRoom incidentId={incidentId} onClose={() => setIncidentId(null)} />}
      {agentOpen && <AgentConsole onClose={() => setAgentOpen(false)} />}
    </div>
  );
}

function ScreenWrap({
  active,
  children,
  className,
}: {
  active: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (!active) return null;
  if (className) return <div className={className}>{children}</div>;
  return <>{children}</>;
}
