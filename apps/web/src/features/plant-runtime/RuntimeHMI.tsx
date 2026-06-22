import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { escalateIncident, getCompiledBundle, issueDevToken } from "../../api/client";
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
import { MapToolbar } from "../maps2d/MapToolbar";
import { PlantMap2D, type PlantMap2DViewportControls } from "../maps2d/PlantMap2D";
import type { MapNode } from "../maps2d/mapTypes";
import { LazyPlantMap3D } from "../maps3d/LazyPlantMap3D";
import { adaptMap3DViewModel } from "../ops3d/adapters";
import { ScenarioLauncher } from "../scenarios/ScenarioLauncher";
import {
  getLockedLayers,
  selectCausalPathVisible,
  useOperationalMapStore,
  type MapZoomBand,
} from "../operational-map";

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

  const [rawExpanded, setRawExpanded] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const [agentOpen, setAgentOpen] = useState(false);
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [showLegend, setShowLegend] = useState(true);
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [map2dControls, setMap2dControls] = useState<PlantMap2DViewportControls | null>(null);

  const mapMode = useOperationalMapStore((s) => s.mode);
  const zoomBand = useOperationalMapStore((s) => s.zoomBand);
  const mapRole = useOperationalMapStore((s) => s.role);
  const selectedAssetId = useOperationalMapStore((s) => s.selectedAssetId);
  const focusAssetId = useOperationalMapStore((s) => s.focusedAssetId);
  const visibleLayers = useOperationalMapStore((s) => s.visibleLayers);
  const activeSituationLocked = useOperationalMapStore((s) => s.activeSituationLocked);
  const setMapMode = useOperationalMapStore((s) => s.setMode);
  const setMapRole = useOperationalMapStore((s) => s.setRole);
  const selectAsset = useOperationalMapStore((s) => s.selectAsset);
  const focusAsset = useOperationalMapStore((s) => s.focusAsset);
  const clearSelection = useOperationalMapStore((s) => s.clearSelection);
  const toggleLayer = useOperationalMapStore((s) => s.toggleLayer);
  const setActiveSituationLocked = useOperationalMapStore((s) => s.setActiveSituationLocked);
  const dispatchMapCommand = useOperationalMapStore((s) => s.dispatchMapCommand);
  const setZoomBand = useOperationalMapStore((s) => s.setZoomBand);
  const showCausalPath = useOperationalMapStore(selectCausalPathVisible);
  const lockedLayers = useMemo(
    () => getLockedLayers(activeSituationLocked),
    [activeSituationLocked],
  );

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selectedAssetId) {
        clearSelection();
        return;
      }
      if (scenarioOpen) setScenarioOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedAssetId, scenarioOpen, clearSelection]);

  const hmiRootAssetId = useMemo(() => getPrimaryRootAssetId(hmiState), [hmiState]);

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

  const hmi = compiledQuery.data?.hmi_view_model;
  const nodes2d = hmi?.map_2d?.nodes ?? [];
  const edges2d = hmi?.map_2d?.edges ?? [];
  const map3d = useMemo(() => adaptMap3DViewModel(hmi?.map_3d), [hmi?.map_3d]);
  const nodes3d = map3d.nodes;
  const edges3d = map3d.edges;
  const plantName = compiledQuery.data?.plant_id?.replace(/_/g, " ") ?? "PlantLens Demo";

  const hmiAssetStatus = useMemo(() => buildHmiAssetStatusMap(hmiState), [hmiState]);
  const effectiveAssetStatus = useMemo(
    () => (Object.keys(hmiAssetStatus).length ? hmiAssetStatus : assetStatus),
    [hmiAssetStatus, assetStatus],
  );

  const hmiCausalPath = useMemo(() => getActiveCausalityAssetPath(hmiState), [hmiState]);
  const causalPath = showCausalPath
    ? hmiCausalPath.length
      ? hmiCausalPath
      : (activeSituation?.causal_path ?? [])
    : [];

  const plantHealth = useMemo(
    () => (hmiState ? formatOverallStatus(hmiState.overall_status) : derivePlantHealth(assetStatus)),
    [hmiState, assetStatus],
  );
  const timeLabel = lastHmiStateTs ?? lastSnapshotTs ?? "—";
  const dataSource = hmiState ? "HMI Projection" : "WebSocket";

  const hmiRuntimeError = useMemo(() => {
    if (!hmiStateQuery.isError) return null;
    const error = hmiStateQuery.error;
    if (isRuntimeEndpointUnavailable(error)) {
      return "HMI runtime projection unavailable. Showing WebSocket snapshot fallback.";
    }
    if (error instanceof Error) return error.message;
    return "HMI runtime projection unavailable. Showing WebSocket snapshot fallback.";
  }, [hmiStateQuery.isError, hmiStateQuery.error]);

  const rootAssetId = hmiRootAssetId ?? activeSituation?.root_asset_id ?? null;
  const affectedAssetIds =
    hmiState?.active_incident?.affected_assets?.length
      ? hmiState.active_incident.affected_assets
      : (activeSituation?.affected_asset_ids ?? []);

  const selectedNode: MapNode | null = useMemo(
    () => nodes2d.find((n) => n.id === selectedAssetId) ?? null,
    [nodes2d, selectedAssetId],
  );

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
      map2dControls?.focusRoot();
    }
  }, [rootAssetId, dispatchMapCommand, focusAsset, map2dControls]);

  const handleFitPlant = useCallback(() => {
    dispatchMapCommand({ type: "fit_plant" });
    map2dControls?.fitPlant();
  }, [dispatchMapCommand, map2dControls]);

  const handleZoomIn = useCallback(() => {
    map2dControls?.zoomIn();
  }, [map2dControls]);

  const handleZoomOut = useCallback(() => {
    map2dControls?.zoomOut();
  }, [map2dControls]);

  const handleZoomBandChange = useCallback(
    (band: MapZoomBand) => {
      setZoomBand(band);
    },
    [setZoomBand],
  );

  const handleToggleCausalPath = useCallback(() => {
    dispatchMapCommand({ type: "show_causal_path", visible: !showCausalPath });
  }, [dispatchMapCommand, showCausalPath]);

  const map2dProps = {
    nodes: nodes2d,
    edges: edges2d,
    assetStatus: effectiveAssetStatus,
    causalPath,
    rootAssetId,
    affectedAssetIds,
    reducedMotion,
    showLegend,
    focusAssetId,
    density,
    onSelectAsset: handleSelectAsset,
    onViewportReady: setMap2dControls,
    onZoomBandChange: handleZoomBandChange,
    role: mapRole,
    zoomBand,
    visibleLayers,
    tags,
    alarms: activeAlarms,
  };

  const map3dProps = {
    nodes: nodes3d,
    edges: edges3d,
    assetStatus: effectiveAssetStatus,
    causalPath,
    rootAssetId,
    reducedMotion,
    onSelectAsset: handleSelectAsset,
  };

  const hasMap2d = nodes2d.length > 0;
  const hasMap3d = nodes3d.length > 0;

  return (
    <div className={`runtime-hmi operator-shell${density === "compact" ? " runtime-hmi--compact" : ""}`}>
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
        onOpenAgents={() => setAgentOpen(true)}
        onOpenScenarios={() => setScenarioOpen((v) => !v)}
      />

      <div className="runtime-hmi__map-row">
        <div className="runtime-hmi__map-panel">
          <MapToolbar
            mapMode={mapMode}
            onMapModeChange={setMapMode}
            role={mapRole}
            onRoleChange={setMapRole}
            visibleLayers={visibleLayers}
            lockedLayers={lockedLayers}
            onToggleLayer={toggleLayer}
            showLegend={showLegend}
            onToggleLegend={() => setShowLegend((v) => !v)}
            showCausalPath={showCausalPath}
            onToggleCausalPath={handleToggleCausalPath}
            causalPathLocked={activeSituationLocked}
            onFocusRoot={handleFocusRoot}
            hasRoot={Boolean(rootAssetId)}
            onFitPlant={handleFitPlant}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            canNavigate2D={Boolean(map2dControls)}
            zoomBand={zoomBand}
            {...(map2dControls
              ? { scaleLabel: `${Math.round(map2dControls.scale * 100)}%` }
              : {})}
            density={density}
            onDensityChange={setDensity}
            reducedMotion={reducedMotion}
          />

          <main className="runtime-hmi__map" aria-label="Plant map">
            {compiledQuery.isLoading && (
              <div className="pl-empty-state" role="status">Loading compiled HMI…</div>
            )}
            {compiledQuery.isError && (
              <div className="pl-error-state" role="alert">
                Compiled HMI unavailable. Start the API and compile the demo bundle.
              </div>
            )}
            {!hasMap2d && !hasMap3d && !compiledQuery.isLoading && (
              <div className="pl-empty-state" role="status">No map nodes — compile the plant bundle first.</div>
            )}
            {mapMode === "2d" && hasMap2d && <PlantMap2D {...map2dProps} />}
            {mapMode === "2d" && !hasMap2d && hasMap3d && !compiledQuery.isLoading && (
              <div className="pl-empty-state" role="status">No 2D map nodes available.</div>
            )}
            {mapMode === "3d" && hasMap3d && (
              <LazyPlantMap3D
                {...map3dProps}
                webglAvailable={webglAvailable}
                onSwitch2D={() => setMapMode("2d" as const)}
              />
            )}
            {mapMode === "3d" && !hasMap3d && !compiledQuery.isLoading && (
              <div className="pl-empty-state" role="status">No 3D map nodes available.</div>
            )}
          </main>

          {scenarioOpen && (
            <div className="runtime-hmi__scenario-panel">
              <ScenarioLauncher onClose={() => setScenarioOpen(false)} />
            </div>
          )}
        </div>

        <aside className="runtime-hmi__situation" aria-label="Active situation">
          {hmiState ? (
            <HmiStatePanel
              state={hmiState}
              runtimeError={hmiRuntimeError}
              onViewRawAlarms={() => setRawExpanded(true)}
              onHighlightAsset={handleHighlightAsset}
            />
          ) : (
            <>
              {hmiRuntimeError && (
                <div className="hmi-runtime-fallback-warn" role="alert">
                  {hmiRuntimeError}
                </div>
              )}
              {calmCard ? (
                <CalmCard
                  card={calmCard}
                  onViewRawAlarms={() => setRawExpanded(true)}
                  onEscalate={() => escalateMutation.mutate()}
                  onHighlightAsset={handleHighlightAsset}
                  onFocusRoot={handleFocusRoot}
                  escalating={escalateMutation.isPending}
                />
              ) : (
                <NoActiveSituation />
              )}
            </>
          )}
        </aside>
      </div>

      <RawAlarmTable
        alarms={activeAlarms}
        situationTitle={activeSituation?.title ?? null}
        defaultExpanded={rawExpanded}
        onExpandedChange={setRawExpanded}
      />

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
      />

      {incidentId && <IncidentRoom incidentId={incidentId} onClose={() => setIncidentId(null)} />}
      {agentOpen && <AgentConsole onClose={() => setAgentOpen(false)} />}
    </div>
  );
}