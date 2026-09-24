import { Boxes, CircleCheck, Siren } from "lucide-react";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useShelvedAlarms } from "../../api/queries";
import { useRuntimeStore } from "../../app/store/runtime";
import { Button, EmptyState, ErrorNotice, Mono } from "../../components/ui/primitives";
import { useAlarmRows } from "../alarms/useAlarmRows";
import { CalmCard } from "../calm-card/CalmCard";
import type { RuntimeCalmCard, RuntimeSituation } from "../calm-card/calmCardModel";
import { composeCalmCard } from "../calm-card/calmCardModel";
import { useEscalate } from "../incidents/useEscalate";
import { assetStatusKind, pluralize } from "../operational-map/format";
import { usePlantModel } from "../operational-map/plantModel";
import { useRuntimeNow } from "../operational-map/runtimeClock";
import { useOperateRuntime } from "../operational-map/useRuntimeSeed";
import { ScenarioLauncher } from "../scenarios/ScenarioLauncher";
import { AlarmStrip } from "./AlarmStrip";
import { AssetSheet } from "./AssetSheet";
import { PlantMap } from "./PlantMap";
import "../operational-map/ops.css";
import "./overview.css";

/**
 * Operator Overview (ISA-101 layout grammar): hero 2D plant map, the active situation as a Calm
 * Card on the right, and the raw alarm strip underneath — always visible. The shell owns chrome.
 */
export function OverviewPage() {
  useOperateRuntime();
  const now = useRuntimeNow(1000);
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("asset");
  const { model, error: modelError, isLoading } = usePlantModel();
  const assetStatus = useRuntimeStore((s) => s.assetStatus);
  const tags = useRuntimeStore((s) => s.tags);
  const hasSnapshot = useRuntimeStore((s) => s.hasSnapshot);
  const situation = useRuntimeStore((s) => s.activeSituation) as RuntimeSituation | null;
  const calmCard = useRuntimeStore((s) => s.calmCard) as RuntimeCalmCard | null;
  const alarms = useRuntimeStore((s) => s.activeAlarms);
  const { rows } = useAlarmRows();
  const shelved = useShelvedAlarms();
  const escalate = useEscalate();

  const view = useMemo(
    () => (situation ? composeCalmCard(calmCard, situation, { alarms, model }) : null),
    [calmCard, situation, alarms, model],
  );
  const alarmedTagIds = useMemo(() => new Set(alarms.map((a) => a.tag_id)), [alarms]);
  const selected = selectedId ? (model.assetById[selectedId] ?? null) : null;

  const select = (id: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set("asset", id);
        else next.delete("asset");
        return next;
      },
      { replace: true },
    );

  const abnormalCount = Object.values(assetStatus).filter((s) => s !== "normal" && s !== "unknown").length;

  return (
    <div className="ov-page">
      <section className="ov-mapcard" aria-label="Plant map">
        <header className="ov-mapcard__head">
          <div className="ov-mapcard__title">
            <h1>Plant overview</h1>
            <span className="ops-muted">
              {model.plantId ? <Mono>{model.plantId}</Mono> : null}
              {model.assets.length ? ` · ${pluralize(model.assets.filter((a) => a.position).length, "asset")}` : ""}
              {abnormalCount ? ` · ${abnormalCount} abnormal` : hasSnapshot ? " · all normal" : ""}
            </span>
          </div>
          <div className="ov-mapcard__actions">
            <ScenarioLauncher />
            <Link to="/ops/3d" className="pl-btn pl-btn--ghost pl-btn--sm">
              <Boxes width={13} height={13} aria-hidden /> 3D view
            </Link>
          </div>
        </header>
        {modelError ? (
          <div style={{ padding: 16 }}>
            <ErrorNotice error={modelError} />
          </div>
        ) : isLoading ? (
          <EmptyState title="Loading plant model…" />
        ) : model.assets.length ? (
          <PlantMap
            model={model}
            assetStatus={assetStatus}
            tags={tags}
            alarmedTagIds={alarmedTagIds}
            causalPath={situation?.causal_path ?? null}
            rootAssetId={situation?.root_asset_id ?? null}
            selectedId={selectedId}
            onSelect={(id) => select(id === selectedId ? null : id)}
          />
        ) : (
          <EmptyState title="No compiled plant map">Compile the plant in Studio to draw the map.</EmptyState>
        )}
      </section>

      <aside className="ov-side" aria-label="Active situation">
        {view ? (
          <CalmCard
            view={view}
            now={now}
            rootStatus={assetStatusKind(assetStatus[view.rootAssetId])}
            actions={
              <>
                <Button size="sm" onClick={() => select(view.rootAssetId)}>
                  Show root on map
                </Button>
                <Button size="sm" variant="ghost" icon={<Siren />} onClick={() => escalate.mutate()} busy={escalate.isPending}>
                  Open incident room
                </Button>
              </>
            }
          />
        ) : (
          <div className="ov-calm">
            <CircleCheck aria-hidden />
            <h2>No active situation</h2>
            <p>
              {rows.length
                ? `${pluralize(rows.length, "alarm")} active, but no approved root cause explains them. Work them from the alarm list.`
                : hasSnapshot
                  ? "The plant is running inside every configured limit."
                  : "Waiting for the first runtime snapshot…"}
            </p>
            {rows.length ? (
              <Link className="ops-link" to="/ops/alarms">
                Open alarm list
              </Link>
            ) : null}
          </div>
        )}
        {escalate.error ? (
          <div style={{ padding: "0 16px 16px" }}>
            <ErrorNotice error={escalate.error} />
          </div>
        ) : null}
      </aside>

      <AlarmStrip rows={rows} now={now} shelvedCount={shelved.data?.shelved.length ?? 0} />

      {selected ? (
        <AssetSheet
          asset={selected}
          status={assetStatus[selected.id] ?? "unknown"}
          model={model}
          tags={tags}
          alarms={rows}
          now={now}
          onOpenChange={(o) => !o && select(null)}
        />
      ) : null}
    </div>
  );
}
