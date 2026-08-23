import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from "react";
import { listOfflineIngestRuns, type OfflineIngestRunSummary } from "../../api/client";
import { Button } from "../../components/ui/button";
import { StudioFormShell } from "../studio-forms/StudioFormShell";
import { CompilePreviewShell } from "./CompilePreviewShell";
import type { StudioRouteState, StudioSurface } from "./studioTypes";

interface StudioLaunchpadProps {
  open: boolean;
  route: StudioRouteState;
  onClose: () => void;
  onNavigate: (surface: StudioSurface, targetId?: string | null) => void;
  compiledBundle?: unknown;
}

const NAV_ITEMS: Array<{ surface: StudioSurface; label: string; hint: string }> = [
  { surface: "overview", label: "Overview", hint: "Source-of-truth rules" },
  { surface: "asset", label: "Assets", hint: "Plant topology" },
  { surface: "tag", label: "Tags", hint: "Tag map" },
  { surface: "alarm_rule", label: "Alarm Rules", hint: "Thresholds & DQ" },
  { surface: "causal_edge", label: "Causal Graph", hint: "Approved edges" },
  { surface: "fault_matrix", label: "Fault Matrix", hint: "Symptom weights" },
  { surface: "action", label: "Actions", hint: "Action envelope" },
  { surface: "compile_preview", label: "Compile Preview", hint: "Local projection" },
];

class StudioErrorBoundary extends Component<
  { children: ReactNode; onReset?: () => void },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Studio surface failed", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="studio-launchpad__error" role="alert">
          <h3>Studio hit an error</h3>
          <p className="text-sm text-ink-500 text-pretty">
            {this.state.error.message || "The draft surface failed to render."} Drafts were not applied to
            runtime.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                this.setState({ error: null });
                this.props.onReset?.();
              }}
            >
              Retry surface
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function OfflineIngestStub() {
  const [runs, setRuns] = useState<OfflineIngestRunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadRuns = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listOfflineIngestRuns();
      setRuns(data);
    } catch (err) {
      setRuns(null);
      setError(err instanceof Error ? err.message : "Failed to load ingest runs");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="studio-launchpad__ingest-stub">
      <Button type="button" variant="outline" size="sm" onClick={() => void loadRuns()} disabled={loading}>
        {loading ? "Loading…" : "Load ingest drafts"}
      </Button>
      <p className="studio-launchpad__hint">
        Lists offline ingest run status via GET /api/offline-ingest/runs.
      </p>
      {error ? (
        <p role="alert" className="studio-launchpad__alert">
          {error}
        </p>
      ) : null}
      {runs ? (
        <ul className="studio-launchpad__run-list">
          {runs.length === 0 ? (
            <li>No offline ingest runs yet.</li>
          ) : (
            runs.slice(0, 12).map((run) => (
              <li key={run.run_id}>
                <span className="font-mono">{run.run_id}</span>
                <span>
                  {" "}
                  — {run.status}
                  {run.document_kind ? ` (${run.document_kind})` : ""}
                </span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

function StudioOverview() {
  return (
    <div className="studio-launchpad__main studio-launchpad__main--overview">
      <header className="studio-launchpad__section-head">
        <h3>Source of truth</h3>
        <p>Forms author the plant model. Graph, HMI, and runtime are projections.</p>
      </header>
      <div className="studio-launchpad__overview-grid">
        <ul className="studio-launchpad__rules">
          <li>Authored contracts are canonical — plant, tag map, alarm rules, causal graph, action envelope.</li>
          <li>Forms are the editing surface; graph and HMI are projections.</li>
          <li>Compiled HMI and runtime snapshots are outputs — never hand-edited in the live HMI.</li>
          <li>Studio drafts require human approval before any backend apply.</li>
          <li>PlantLens is read-only advisory at runtime — no direct hardware control.</li>
        </ul>
        <OfflineIngestStub />
      </div>
    </div>
  );
}

function StudioMainPanel({
  route,
  compiledBundle,
}: {
  route: StudioRouteState;
  compiledBundle?: unknown;
}) {
  if (route.surface === "overview") {
    return <StudioOverview />;
  }

  if (route.surface === "compile_preview") {
    return (
      <div className="studio-launchpad__main studio-launchpad__main--forms">
        <CompilePreviewShell compiledBundle={compiledBundle} />
      </div>
    );
  }

  return (
    <div className="studio-launchpad__main studio-launchpad__main--forms">
      <StudioFormShell route={route} />
    </div>
  );
}

export function StudioLaunchpad({
  open,
  route,
  onClose,
  onNavigate,
  compiledBundle,
}: StudioLaunchpadProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="studio-launchpad" role="dialog" aria-modal="true" aria-label="PlantLens Studio">
      <header className="studio-launchpad__header">
        <div>
          <p className="studio-launchpad__eyebrow">Authoring · local draft · Esc to close</p>
          <h2>PlantLens Studio</h2>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </header>

      <div className="studio-launchpad__panel">
        <nav className="studio-launchpad__nav" aria-label="Studio surfaces">
          <ul>
            {NAV_ITEMS.map((item) => {
              const active = route.surface === item.surface;
              return (
                <li key={item.surface}>
                  <button
                    type="button"
                    className={
                      active
                        ? "studio-launchpad__nav-item studio-launchpad__nav-item--active"
                        : "studio-launchpad__nav-item"
                    }
                    aria-current={active ? "page" : undefined}
                    onClick={() => onNavigate(item.surface, null)}
                  >
                    <span className="studio-launchpad__nav-label">{item.label}</span>
                    <span className="studio-launchpad__nav-hint">{item.hint}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <StudioErrorBoundary onReset={() => onNavigate("overview", null)}>
          <StudioMainPanel route={route} compiledBundle={compiledBundle} />
        </StudioErrorBoundary>
      </div>
    </div>
  );
}
