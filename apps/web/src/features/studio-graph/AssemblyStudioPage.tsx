import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { issueDevToken } from "../../api/client";
import { setAuthToken } from "../../api/config";
import { AssemblyCanvas } from "./AssemblyCanvas";
import { AssemblyInspector } from "./AssemblyInspector";
import { ComponentPalette } from "./ComponentPalette";
import { fetchComponentLibrary } from "./componentLibraryApi";
import { checkPortCompatibilityLocal } from "./connectionValidation";
import { MatrixPanel } from "./MatrixPanel";
import { analyzeAssembly, type AnalysisResult } from "./studioAnalysisApi";
import { useAssemblyStudioStore } from "./studioAssemblyState";
import "./assemblyStudio.css";
import "./componentPalette.css";

export function AssemblyStudioPage() {
  const [authReady, setAuthReady] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const assembly = useAssemblyStudioStore((s) => s.assembly);
  const library = useAssemblyStudioStore((s) => s.library);
  const setLibrary = useAssemblyStudioStore((s) => s.setLibrary);
  const addAsset = useAssemblyStudioStore((s) => s.addAsset);
  const selectedAssetId = useAssemblyStudioStore((s) => s.selectedAssetId);
  const selectedConnectionId = useAssemblyStudioStore((s) => s.selectedConnectionId);
  const rejectionMessage = useAssemblyStudioStore((s) => s.rejectionMessage);
  const updateConnection = useAssemblyStudioStore((s) => s.updateConnection);
  const getTemplate = useAssemblyStudioStore((s) => s.getTemplate);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await issueDevToken("viewer");
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

  const libraryQuery = useQuery({
    queryKey: ["component-library"],
    queryFn: ({ signal }) => fetchComponentLibrary(signal),
    enabled: authReady,
  });

  useEffect(() => {
    if (libraryQuery.data?.components) {
      setLibrary(libraryQuery.data.components);
    }
  }, [libraryQuery.data, setLibrary]);

  const selectedAsset = assembly.assets.find((a) => a.asset_id === selectedAssetId) ?? null;
  const selectedConnection =
    assembly.connections.find((c) => c.connection_id === selectedConnectionId) ?? null;

  const compatibility = useMemo(() => {
    if (!selectedConnection) return { reason: null, warnings: [] as string[] };
    const fromAsset = assembly.assets.find((a) => a.asset_id === selectedConnection.from_asset_id);
    const toAsset = assembly.assets.find((a) => a.asset_id === selectedConnection.to_asset_id);
    if (!fromAsset || !toAsset) return { reason: null, warnings: [] };
    const fromTemplate = getTemplate(fromAsset.component_type_id);
    const toTemplate = getTemplate(toAsset.component_type_id);
    if (!fromTemplate || !toTemplate) return { reason: null, warnings: [] };
    const result = checkPortCompatibilityLocal(
      fromTemplate,
      selectedConnection.from_port_id,
      toTemplate,
      selectedConnection.to_port_id,
    );
    return { reason: result.reason, warnings: result.warnings };
  }, [assembly.assets, getTemplate, selectedConnection]);

  const handleAnalyzeAssembly = useCallback(async () => {
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const result = await analyzeAssembly(assembly);
      setAnalysis(result);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Analysis request failed");
    } finally {
      setAnalysisLoading(false);
    }
  }, [assembly]);

  const handleAddComponent = (componentTypeId: string) => {
    const template = library.find((c) => c.component_type_id === componentTypeId);
    if (!template) return;
    const x = 80 + (assembly.assets.length % 4) * 220;
    const y = 80 + Math.floor(assembly.assets.length / 4) * 160;
    addAsset(template, { x, y });
  };

  const compileStatus = (() => {
    if (!analysis) return null;
    if (analysis.errors?.length) return "fail";
    const obs = analysis.observability_matrix?.summary;
    if (!obs) return "pass";
    const coverage = obs.total_faults > 0 ? obs.observable_faults / obs.total_faults : 1;
    if (coverage >= 0.75) return "pass";
    if (coverage >= 0.4) return "warn";
    return "fail";
  })();

  return (
    <div className="assembly-studio">
      <header className="assembly-studio__header">
        <div>
          <h1 className="assembly-studio__title">
            <span className="assembly-studio__title-bracket">[</span>
            Assembly Studio
            <span className="assembly-studio__title-bracket">]</span>
          </h1>
          <p>
            {assembly.assets.length} assets · {assembly.connections.length} connections
            {compileStatus === "pass" && <span className="compile-badge compile-badge--pass">COMPILE OK</span>}
            {compileStatus === "warn" && <span className="compile-badge compile-badge--warn">COMPILE WARN</span>}
            {compileStatus === "fail" && <span className="compile-badge compile-badge--fail">COMPILE FAIL</span>}
          </p>
        </div>
        <nav className="assembly-studio__nav">
          <button type="button" onClick={handleAnalyzeAssembly} disabled={analysisLoading || assembly.assets.length === 0}>
            {analysisLoading ? "⟳ Running…" : "▶ Compile"}
          </button>
          <Link to="/studio/library">Component catalog</Link>
          <Link to="/studio">Studio forms</Link>
        </nav>
      </header>

      {rejectionMessage ? (
        <div className="assembly-studio__rejection" role="alert">
          ⚠ {rejectionMessage}
        </div>
      ) : null}

      <div className="assembly-studio__layout">
        <section className="assembly-studio__palette">
          {libraryQuery.isLoading ? <p>Loading library…</p> : null}
          {libraryQuery.data ? (
            <ComponentPalette
              components={libraryQuery.data.components}
              onAddComponent={handleAddComponent}
            />
          ) : null}
        </section>
        <section className="assembly-studio__canvas-wrap">
          <AssemblyCanvas />
        </section>
        <MatrixPanel analysis={analysis} loading={analysisLoading} error={analysisError} />
        <AssemblyInspector
          asset={selectedAsset}
          connection={selectedConnection}
          fromTemplate={
            selectedConnection
              ? getTemplate(
                  assembly.assets.find((a) => a.asset_id === selectedConnection.from_asset_id)
                    ?.component_type_id ?? "",
                )
              : undefined
          }
          toTemplate={
            selectedConnection
              ? getTemplate(
                  assembly.assets.find((a) => a.asset_id === selectedConnection.to_asset_id)
                    ?.component_type_id ?? "",
                )
              : undefined
          }
          compatibilityReason={compatibility.reason}
          compatibilityWarnings={compatibility.warnings}
          onToggleApproved={(id, approved) => updateConnection(id, { approved })}
          onUpdateLag={(id, lagMin, lagMax) =>
            updateConnection(id, { lag_min_ms: lagMin, lag_max_ms: lagMax })
          }
          onUpdateNotes={(id, notes) => updateConnection(id, { notes })}
        />
      </div>
    </div>
  );
}