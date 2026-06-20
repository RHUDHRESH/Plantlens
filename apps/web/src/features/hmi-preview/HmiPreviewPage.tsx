import { useCallback, useEffect, useMemo, useState } from "react";
import { getRuntimeHmiState, isRuntimeEndpointUnavailable, postHmiPreview } from "../../api/hmi";
import { issueDevToken } from "../../api/client";
import { setAuthToken } from "../../api/config";
import { ApiError } from "../../api/types";
import type { PlantHMIState } from "../../app/schemas/plantHmi";
import { AlarmGroups } from "./AlarmGroups";
import { CausalChain } from "./CausalChain";
import { DataQualityBanner } from "./DataQualityBanner";
import { EvidenceList } from "./EvidenceList";
import { HmiJsonDisclosure } from "./HmiJsonDisclosure";
import { HmiModeSwitcher, type HmiMode } from "./HmiModeSwitcher";
import { HmiStateStrip } from "./HmiStateStrip";
import { IncidentPanel } from "./IncidentPanel";
import { OperatorActions } from "./OperatorActions";
import { RuntimeUnavailableNotice } from "./RuntimeUnavailableNotice";
import { SignalTable } from "./SignalTable";
import { SourceBadge } from "./SourceBadge";
import { HMI_SCENARIOS } from "./scenarios";
import "./hmi-preview.css";

function resolvePreviewSourceLabel(scenarioId: string, state: PlantHMIState | null): string {
  if (scenarioId === "gate_blocker" || state?.overall_status === "blocked") {
    return "Blocked Gate Preview";
  }
  return "Scenario Preview";
}

function formatLoadedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function HmiPreviewPage() {
  const [mode, setMode] = useState<HmiMode>("preview");
  const [selectedScenarioId, setSelectedScenarioId] = useState(HMI_SCENARIOS[0]?.id ?? "healthy");
  const [hmiState, setHmiState] = useState<PlantHMIState | null>(null);
  const [sourceLabel, setSourceLabel] = useState("Unknown");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);
  const [runtimeUnavailable, setRuntimeUnavailable] = useState(false);
  const [runtimeNetworkError, setRuntimeNetworkError] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    issueDevToken("viewer")
      .then((token) => {
        if (!cancelled) {
          setAuthToken(token);
          setAuthReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not obtain dev auth token. API calls may fail.");
          setAuthReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedScenario = useMemo(
    () => HMI_SCENARIOS.find((scenario) => scenario.id === selectedScenarioId) ?? HMI_SCENARIOS[0],
    [selectedScenarioId],
  );

  const handleModeChange = useCallback((nextMode: HmiMode) => {
    setMode(nextMode);
    setError(null);
    if (nextMode === "runtime") {
      setHmiState(null);
      setSourceLabel("Unknown");
      setLastLoadedAt(null);
    }
  }, []);

  const runPreview = useCallback(async () => {
    if (!selectedScenario) return;
    setLoading(true);
    setError(null);
    setRuntimeUnavailable(false);
    try {
      const state = await postHmiPreview(selectedScenario.buildRequest());
      setHmiState(state);
      setSourceLabel(resolvePreviewSourceLabel(selectedScenario.id, state));
      setLastLoadedAt(formatLoadedAt(new Date().toISOString()));
    } catch (err) {
      setHmiState(null);
      setError(err instanceof ApiError ? err.body.message : "HMI preview request failed.");
    } finally {
      setLoading(false);
    }
  }, [selectedScenario]);

  const loadRuntime = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRuntimeUnavailable(false);
    setRuntimeNetworkError(false);
    try {
      const state = await getRuntimeHmiState();
      setHmiState(state);
      setSourceLabel("Runtime Snapshot");
      setLastLoadedAt(formatLoadedAt(new Date().toISOString()));
    } catch (err) {
      setHmiState(null);
      setSourceLabel("Unknown");
      setLastLoadedAt(null);
      if (isRuntimeEndpointUnavailable(err)) {
        setRuntimeUnavailable(true);
        setRuntimeNetworkError(err instanceof ApiError && err.status === 0);
        setError(null);
      } else {
        setError(err instanceof ApiError ? err.body.message : "Runtime HMI request failed.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const evidence = hmiState?.active_incident?.evidence ?? [];

  return (
    <div className="hmi-runtime-shell operator-shell">
      <header className="hmi-runtime-shell__header">
        <div>
          <h1>HMI Runtime Shell</h1>
          <p className="hmi-runtime-shell__subtitle">
            Renders backend PlantHMIState only — no browser-side diagnosis.
          </p>
        </div>
        <SourceBadge sourceLabel={sourceLabel} lastLoadedAt={lastLoadedAt} />
      </header>

      {!authReady ? (
        <p className="hmi-runtime-shell__loading">Preparing API auth…</p>
      ) : (
        <>
          <HmiModeSwitcher
            mode={mode}
            selectedScenarioId={selectedScenarioId}
            scenarios={HMI_SCENARIOS}
            loading={loading}
            runtimeUnavailable={runtimeUnavailable}
            onModeChange={handleModeChange}
            onScenarioChange={setSelectedScenarioId}
            onRunPreview={runPreview}
            onLoadRuntime={loadRuntime}
          />

          {mode === "runtime" && runtimeUnavailable && (
            <RuntimeUnavailableNotice isNetworkError={runtimeNetworkError} />
          )}

          {error && (
            <div className="hmi-runtime-shell__error" role="alert">
              {error}
            </div>
          )}

          {hmiState && (
            <div className="hmi-runtime-shell__body">
              <HmiStateStrip state={hmiState} />
              <DataQualityBanner dataQuality={hmiState.data_quality} />
              <div className="hmi-runtime-shell__grid">
                <IncidentPanel incident={hmiState.active_incident} />
                <EvidenceList evidence={evidence} />
                <CausalChain assets={hmiState.assets} edges={hmiState.causality_edges} />
                <SignalTable signals={hmiState.signals} />
                <OperatorActions actions={hmiState.operator_actions} />
                <AlarmGroups groups={hmiState.alarm_groups} />
              </div>
              <HmiJsonDisclosure state={hmiState} />
            </div>
          )}
        </>
      )}
    </div>
  );
}