/**
 * /ops/3d — the plant in 3D. An enhancement over the canonical 2D views (PLANTLENS.md R8): this
 * route chunk only holds the chrome; three.js, the scene and the equipment models load in a
 * separate lazy chunk after first paint. Data: compiled HMI bundle (map_3d nodes/edges, asset and
 * tag index) + live status, tags and alarms from the runtime store.
 *
 * `?model=<kind>[&status=critical&angle=iso|front|side|rear|top&zoom=1.5&spin=1]` shows a single
 * equipment model on a turntable (model review / docs).
 */
import { useQuery } from "@tanstack/react-query";
import { Box, Crosshair, Maximize2, Minus, Plus } from "lucide-react";
import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getCompiledBundle, getRuntimeSnapshot } from "../../api/client";
import type { CompiledBundle } from "../../api/types";
import { useReducedMotion } from "../../app/hooks/useReducedMotion";
import { useSession } from "../../app/session";
import { useRuntimeStore } from "../../app/store/runtime";
import { Button, EmptyState, ErrorNotice, IconButton, PriorityGlyph, SegmentedControl, StatusBadge } from "../../components/ui/primitives";
import { adaptMap3DViewModel } from "../ops3d/adapters";
import { AssetPanel } from "./AssetPanel";
import { runningAssets, type TagIndexEntry } from "./lib/assetDetails";
import type { CameraCommand, CameraCommandInput, ViewPreset } from "./lib/camera";
import { buildPlantLayout } from "./lib/layout";
import { isModelKind, listModelKinds } from "./lib/registry";
import { normaliseStatus, statusPresentation } from "./lib/status";
import { isWebGLAvailable } from "./lib/webgl";
import "./plant3d.css";

const PlantScene = lazy(() => import("./scene/PlantScene"));
const ModelViewer = lazy(() => import("./scene/ModelViewer"));

class SceneErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    if (this.state.error) return <Unavailable reason="The 3D view stopped (WebGL context lost or out of memory)." />;
    return this.props.children;
  }
}

function Unavailable({ reason }: { reason: string }) {
  return (
    <div className="pl-page">
      <EmptyState icon={<Box />} title="3D view unavailable">
        <p>{reason} The 2D overview shows the same live plant state.</p>
        <p>
          <Link className="pl-btn pl-btn--primary pl-btn--md" to="/ops">
            Open the 2D overview
          </Link>
        </p>
      </EmptyState>
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="plant3d-loading" role="status">
      {label}
    </div>
  );
}

export function Plant3DPage() {
  const [params] = useSearchParams();
  const webgl = useMemo(() => isWebGLAvailable(), []);
  if (!webgl) return <Unavailable reason="This browser or device has WebGL turned off." />;
  const model = params.get("model");
  if (model && isModelKind(model)) {
    const angle = params.get("angle");
    return (
      <div className="pl-page pl-page--full plant3d" data-testid="plant3d-model-review">
        <SceneErrorBoundary>
          <Suspense fallback={<Loading label="Loading model…" />}>
            <ModelViewer
              kind={model}
              status={params.get("status") ?? "normal"}
              selected={params.get("selected") === "1"}
              spin={params.get("spin") === "1"}
              zoom={Number(params.get("zoom") ?? 1) || 1}
              label={params.get("label") ?? model.toUpperCase().slice(0, 10)}
              {...(angle === "iso" || angle === "front" || angle === "side" || angle === "rear" || angle === "back" || angle === "top" ? { angle } : {})}
            />
          </Suspense>
        </SceneErrorBoundary>
        <div className="plant3d-overlay plant3d-overlay--top">
          <div className="plant3d-title">
            <h1>{listModelKinds().find((k) => k.kind === model)?.label}</h1>
            <p>Parametric model · drop a GLB into /models to use manufacturer CAD</p>
          </div>
        </div>
      </div>
    );
  }
  return <PlantView />;
}

const PRESETS: { value: ViewPreset; label: string }[] = [
  { value: "iso", label: "Iso" },
  { value: "front", label: "Front" },
  { value: "top", label: "Top" },
];

function PlantView() {
  const authReady = useSession((s) => s.status === "ready");
  const compiled = useQuery<CompiledBundle>({
    queryKey: ["compiled-bundle"],
    queryFn: ({ signal }) => getCompiledBundle(signal),
    enabled: authReady,
    retry: 1,
    staleTime: 60_000,
  });
  // The shell's WebSocket feeds the store; when it isn't live, poll the REST snapshot instead.
  const connection = useRuntimeStore((s) => s.connection);
  const snapshot = useQuery({
    queryKey: ["runtime-snapshot"],
    queryFn: ({ signal }) => getRuntimeSnapshot(signal),
    enabled: authReady && connection !== "live",
    refetchInterval: 2_000,
    retry: 1,
  });
  useEffect(() => {
    if (snapshot.data && useRuntimeStore.getState().connection !== "live") useRuntimeStore.getState().applySnapshot(snapshot.data);
  }, [snapshot.data]);
  const assetStatus = useRuntimeStore((s) => s.assetStatus);
  const alarms = useRuntimeStore((s) => s.activeAlarms);
  const tags = useRuntimeStore((s) => s.tags);
  const reducedMotion = useReducedMotion();

  const bundle = compiled.data as (CompiledBundle & { tag_index?: Record<string, TagIndexEntry>; asset_index?: Record<string, never> }) | undefined;
  const view = useMemo(() => adaptMap3DViewModel(bundle?.hmi_view_model?.map_3d), [bundle]);
  const layout = useMemo(() => {
    const areaIds = [...new Set(view.nodes.map((n) => n.area_id).filter((a): a is string => !!a))];
    return buildPlantLayout(view.nodes, {
      areas: areaIds.map((id) => ({ id, name: id.replace(/[_-]/g, " ").replace(/^\w/, (c) => c.toUpperCase()) })),
      ...(bundle?.asset_index ? { assetInfo: bundle.asset_index } : {}),
    });
  }, [view, bundle]);
  const tagIndex = useMemo(() => bundle?.tag_index ?? {}, [bundle]);
  const running = useMemo(() => runningAssets(tags, tagIndex), [tags, tagIndex]);
  const statusById = useMemo(() => {
    const out: Record<string, ReturnType<typeof normaliseStatus>> = {};
    for (const a of layout.assets) out[a.id] = normaliseStatus(assetStatus[a.id]);
    return out;
  }, [layout, assetStatus]);
  const abnormal = useMemo(
    () =>
      layout.assets
        .map((a) => ({ asset: a, p: statusPresentation(statusById[a.id]) }))
        .filter((x) => x.p.abnormal)
        .sort((a, b) => a.p.rank - b.p.rank),
    [layout, statusById],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preset, setPreset] = useState<ViewPreset>("iso");
  const [command, setCommand] = useState<CameraCommand | null>(null);
  const send = useCallback((c: CameraCommandInput) => setCommand({ ...c, nonce: Date.now() + Math.random() } as CameraCommand), []);
  const selected = layout.assets.find((a) => a.id === selectedId) ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (compiled.isError) {
    return (
      <div className="pl-page">
        <ErrorNotice error={compiled.error} />
      </div>
    );
  }

  const ready = compiled.isSuccess && layout.assets.length > 0;

  return (
    <div className={`pl-page pl-page--full plant3d${selected ? " has-panel" : ""}`} data-testid="plant3d-page">
      <div className="plant3d-stage">
        {ready ? (
          <SceneErrorBoundary>
            <Suspense fallback={<Loading label="Loading 3D plant…" />}>
              <PlantScene
                layout={layout}
                edges={view.edges}
                assetStatus={statusById}
                running={running}
                selectedId={selectedId}
                command={command}
                reducedMotion={reducedMotion}
                onSelect={setSelectedId}
              />
            </Suspense>
          </SceneErrorBoundary>
        ) : compiled.isSuccess ? (
          <div className="pl-page">
            <EmptyState icon={<Box />} title="No 3D layout in the compiled bundle">
              Add <code>coords_3d</code> to assets in the plant model and compile again.
            </EmptyState>
          </div>
        ) : (
          <Loading label="Loading plant model…" />
        )}
      </div>

      <div className="plant3d-overlay plant3d-overlay--top">
        <div className="plant3d-title">
          <h1>3D plant</h1>
          <p>Enhancement view — the 2D overview stays the reference.</p>
        </div>
        <div className="plant3d-toolbar" role="toolbar" aria-label="3D view controls">
          <label className="plant3d-visually-hidden" htmlFor="plant3d-asset">
            Go to equipment
          </label>
          <select
            id="plant3d-asset"
            className="pl-select plant3d-select"
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value || null)}
          >
            <option value="">Go to equipment…</option>
            {layout.assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.id} — {a.label}
              </option>
            ))}
          </select>
          <SegmentedControl
            label="View preset"
            value={preset}
            options={PRESETS}
            onChange={(v) => {
              setPreset(v);
              send({ type: "preset", preset: v });
            }}
          />
          <IconButton label="Zoom in" icon={<Plus size={16} />} variant="secondary" onClick={() => send({ type: "zoom", factor: 0.75 })} />
          <IconButton label="Zoom out" icon={<Minus size={16} />} variant="secondary" onClick={() => send({ type: "zoom", factor: 1.33 })} />
          <Button icon={<Maximize2 size={14} />} onClick={() => { setSelectedId(null); setPreset("iso"); send({ type: "fit" }); }}>
            Fit plant
          </Button>
        </div>
          {abnormal.length ? (
            <div className="plant3d-abnormal" aria-label="Abnormal equipment">
              <span className="plant3d-abnormal__label">Abnormal</span>
              {abnormal.map(({ asset, p }) => (
                <button key={asset.id} type="button" className="plant3d-chip" onClick={() => { setSelectedId(asset.id); send({ type: "focus", id: asset.id }); }}>
                  <Crosshair size={12} aria-hidden />
                  <span>{asset.id}</span>
                  {p.badge ? <StatusBadge status={p.badge} label={p.label} compact /> : null}
                </button>
              ))}
            </div>
          ) : null}
      </div>


      <div className="plant3d-overlay plant3d-legend" aria-label="Legend">
        <div className="plant3d-legend__group">
          <span className="plant3d-legend__head">Status</span>
          <span><PriorityGlyph status="critical" /> Critical</span>
          <span><PriorityGlyph status="medium" /> Warning</span>
          <span><PriorityGlyph status="sensor_bad" /> Sensor bad</span>
          <span><PriorityGlyph status="offline" /> Offline</span>
          <span className="plant3d-legend__note">Normal equipment has no outline</span>
        </div>
        <div className="plant3d-legend__group">
          <span className="plant3d-legend__head">Connections</span>
          <span><i className="plant3d-swatch plant3d-swatch--power" /> Power cable in tray</span>
          <span><i className="plant3d-swatch plant3d-swatch--signal" /> Signal conduit</span>
          <span><i className="plant3d-swatch plant3d-swatch--fluid" /> Process pipe</span>
        </div>
      </div>

      {selected ? (
        <AssetPanel
          asset={selected}
          areaName={layout.areas.find((z) => z.id === selected.areaId)?.name}
          status={statusById[selected.id] ?? "unknown"}
          tags={tags}
          tagIndex={tagIndex}
          alarms={alarms}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  );
}
