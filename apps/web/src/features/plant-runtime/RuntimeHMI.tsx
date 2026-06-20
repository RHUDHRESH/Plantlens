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
import { PlantMap2D } from "../maps2d/PlantMap2D";
import type { MapNode } from "../maps2d/mapTypes";
import { LazyPlantMap3D } from "../maps3d/LazyPlantMap3D";
import { ScenarioLauncher } from "../scenarios/ScenarioLauncher";

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
  const [mapMode, setMapMode] = useState<"2d" | "3d">("2d");
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const [agentOpen, setAgentOpen] = useState(false);
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [focusAssetId, setFocusAssetId] = useState<string | null>(null);
  const [showLegend, setShowLegend] = useState(true);
  const [showCausalPath, setShowCausalPath] = useState(true);
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");

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
        setSelectedAssetId(null);
        return;
      }
      if (scenarioOpen) setScenarioOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedAssetId, scenarioOpen]);

  const hmiRootAssetId = useMemo(() => getPrimaryRootAssetId(hmiState), [hmiState]);

  useEffect(() => {
    const nextRoot = hmiRootAssetId ?? activeSituation?.root_asset_id ?? null;
    if (nextRoot) setFocusAssetId(nextRoot);
  }, [hmiRootAssetId, activeSituation?.root_asset_id]);

  const hmi = compiledQuery.data?.hmi_view_model;
  const nodes = hmi?.map_2d?.nodes ?? [];
  const edges = hmi?.map_2d?.edges ?? [];
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
    () => nodes.find((n) => n.id === selectedAssetId) ?? null,
    [nodes, selectedAssetId],
  );

  const handleSelectAsset = useCallback((id: string) => {
    setSelectedAssetId(id);
    setFocusAssetId(id);
  }, []);

  const handleHighlightAsset = useCallback((id: string) => {
    setFocusAssetId(id);
  }, []);

  const mapProps = {
    nodes,
    edges,
    assetStatus: effectiveAssetStatus,
    causalPath,
    rootAssetId,
    affectedAssetIds,
    reducedMotion,
    showLegend,
    focusAssetId,
    density,
    onSelectAsset: handleSelectAsset,
  };

  return (
    <div className={`runtime-hmi operator-shell${density === "compact" ? " runtime-hmi--compact" : ""}`}>
      <RuntimeTopStrip
        plantName={plantName}
        plantHealth={plantHealth}
        mode="Runtime"
        dataSource={dataSource}
        timeLabel={timeLabel}
        role="operator"
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
            showLegend={showLegend}
            onToggleLegend={() => setShowLegend((v) => !v)}
            showCausalPath={showCausalPath}
            onToggleCausalPath={() => setShowCausalPath((v) => !v)}
            onFocusRoot={() => rootAssetId && setFocusAssetId(rootAssetId)}
            hasRoot={Boolean(rootAssetId)}
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
            {nodes.length === 0 && !compiledQuery.isLoading && (
              <div className="pl-empty-state" role="status">No map nodes — compile the plant bundle first.</div>
            )}
            {nodes.length > 0 && mapMode === "2d" && <PlantMap2D {...mapProps} />}
            {nodes.length > 0 && mapMode === "3d" && (
              <LazyPlantMap3D
                {...mapProps}
                webglAvailable={webglAvailable}
                onSwitch2D={() => setMapMode("2d")}
              />
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
                  onFocusRoot={() => rootAssetId && setFocusAssetId(rootAssetId)}
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
        tags={tags}
        alarms={activeAlarms}
        open={Boolean(selectedNode)}
        onClose={() => setSelectedAssetId(null)}
        onFocusMap={(id) => setFocusAssetId(id)}
        onViewRawAlarms={() => setRawExpanded(true)}
      />

      {incidentId && <IncidentRoom incidentId={incidentId} onClose={() => setIncidentId(null)} />}
      {agentOpen && <AgentConsole onClose={() => setAgentOpen(false)} />}
    </div>
  );
}