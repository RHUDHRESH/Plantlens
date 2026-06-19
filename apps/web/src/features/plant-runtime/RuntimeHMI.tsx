import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { escalateIncident, getCompiledBundle, issueDevToken } from "../../api/client";
import { setAuthToken } from "../../api/config";
import { connectRuntimeSocket } from "../../api/ws";
import { useReducedMotion } from "../../app/hooks/useReducedMotion";
import { useWebGLAvailable } from "../../app/hooks/useWebGL";
import { useRuntimeStore } from "../../app/store/runtime";
import { AgentConsole } from "../agents/AgentConsole";
import { CalmCard, NoActiveSituation } from "../calm-card/CalmCard";
import { RawAlarmTable } from "../alarms/RawAlarmTable";
import { IncidentRoom } from "../incidents/IncidentRoom";
import { PlantMap2D } from "../maps2d/PlantMap2D";
import { LazyPlantMap3D } from "../maps3d/LazyPlantMap3D";
import { TopStrip } from "./TopStrip";

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

  const connection = useRuntimeStore((s) => s.connection);
  const assetStatus = useRuntimeStore((s) => s.assetStatus);
  const calmCard = useRuntimeStore((s) => s.calmCard);
  const activeSituation = useRuntimeStore((s) => s.activeSituation);
  const activeAlarms = useRuntimeStore((s) => s.activeAlarms);
  const lastSnapshotTs = useRuntimeStore((s) => s.lastSnapshotTs);

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

  const hmi = compiledQuery.data?.hmi_view_model;
  const nodes = hmi?.map_2d?.nodes ?? [];
  const edges = hmi?.map_2d?.edges ?? [];

  const plantHealth = useMemo(() => derivePlantHealth(assetStatus), [assetStatus]);
  const timeLabel = lastSnapshotTs ?? "—";

  const mapProps = {
    nodes,
    edges,
    assetStatus,
    causalPath: activeSituation?.causal_path ?? [],
    rootAssetId: activeSituation?.root_asset_id ?? null,
    affectedAssetIds: activeSituation?.affected_asset_ids ?? [],
    reducedMotion,
  };

  return (
    <div className="runtime-hmi">
      <TopStrip
        connection={connection}
        plantHealth={plantHealth}
        mode="Runtime"
        dataSource="WebSocket"
        timeLabel={timeLabel}
        role="operator"
        apiAvailable={!compiledQuery.isError}
        onOpenAgents={() => setAgentOpen(true)}
      />

      <div className="runtime-hmi__toolbar">
        <div className="map-toggle" role="group" aria-label="Map view">
          <button
            type="button"
            className={mapMode === "2d" ? "map-toggle__btn--active" : ""}
            aria-pressed={mapMode === "2d"}
            onClick={() => setMapMode("2d")}
          >
            2D
          </button>
          <button
            type="button"
            className={mapMode === "3d" ? "map-toggle__btn--active" : ""}
            aria-pressed={mapMode === "3d"}
            onClick={() => setMapMode("3d")}
          >
            3D
          </button>
        </div>
      </div>

      <div className="runtime-hmi__main">
        <main className="runtime-hmi__map" aria-label="Plant map">
          {compiledQuery.isLoading && <p className="runtime-placeholder">Loading compiled HMI…</p>}
          {compiledQuery.isError && (
            <p className="runtime-placeholder runtime-placeholder--warn" role="alert">
              Compiled HMI unavailable. Map will render when API returns.
            </p>
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

        <aside className="runtime-hmi__situation" aria-label="Active situation">
          {calmCard ? (
            <CalmCard
              card={calmCard}
              onViewRawAlarms={() => setRawExpanded(true)}
              onEscalate={() => escalateMutation.mutate()}
              escalating={escalateMutation.isPending}
            />
          ) : (
            <NoActiveSituation />
          )}
        </aside>
      </div>

      <RawAlarmTable
        alarms={activeAlarms}
        situationTitle={activeSituation?.title ?? null}
        defaultExpanded={rawExpanded}
      />

      {incidentId && (
        <IncidentRoom incidentId={incidentId} onClose={() => setIncidentId(null)} />
      )}
      {agentOpen && <AgentConsole onClose={() => setAgentOpen(false)} />}
    </div>
  );
}