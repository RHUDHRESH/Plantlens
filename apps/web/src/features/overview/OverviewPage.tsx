import { Boxes, CircleCheck, Siren } from "lucide-react";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useRuntimeActions, useShelvedAlarms } from "../../api/queries";
import { ROLE_LABEL, useSession } from "../../app/session";
import { useRuntimeStore } from "../../app/store/runtime";
import { Button, EmptyState, ErrorNotice, Mono, PriorityGlyph } from "../../components/ui/primitives";
import { useAlarmRows } from "../alarms/useAlarmRows";
import { orderActions } from "../calm-card/actionsModel";
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
  const situations = useRuntimeStore((s) => s.activeSituations) as RuntimeSituation[];
  const primary = useRuntimeStore((s) => s.activeSituation) as RuntimeSituation | null;
  const latestCard = useRuntimeStore((s) => s.calmCard) as RuntimeCalmCard | null;
  const role = useSession((s) => s.role);
  // Several situations can be active; the URL remembers which one the operator is reading.
  const wantedSituation = params.get("situation");
  const situation = (wantedSituation ? situations.find((s) => s.situation_id === wantedSituation) : undefined) ?? primary;
  // The broadcast Calm Card describes one situation; for the others the card is composed from the
  // situation itself (never from another situation's card).
  const calmCard = latestCard && situation && latestCard.situation_id === situation.situation_id ? latestCard : null;
  const alarms = useRuntimeStore((s) => s.activeAlarms);
  const { rows } = useAlarmRows();
  const shelved = useShelvedAlarms();
  const escalate = useEscalate();

  const view = useMemo(
    () => (situation ? composeCalmCard(calmCard, situation, { alarms, model }) : null),
    [calmCard, situation, alarms, model],
  );
  const alarmedTagIds = useMemo(() => new Set(alarms.map((a) => a.tag_id)), [alarms]);
  const alarmKey = useMemo(() => alarms.map((a) => a.alarm_id).sort().join(","), [alarms]);
  const actionsQuery = useRuntimeActions(situation?.situation_id ?? null, alarmKey);
  const roleActions = useMemo(
    () => ({
      items: orderActions(actionsQuery.data?.actions, role),
      roleLabel: ROLE_LABEL[role],
      loading: actionsQuery.isLoading,
      error: actionsQuery.error,
    }),
    [actionsQuery.data, actionsQuery.isLoading, actionsQuery.error, role],
  );
  const selected = selectedId ? (model.assetById[selectedId] ?? null) : null;

  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  const select = (id: string | null) => setParam("asset", id);

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
            roleActions={roleActions}
            switcher={
              situations.length > 1 ? (
                <SituationSwitcher
                  situations={situations}
                  selectedId={situation?.situation_id ?? null}
                  nameOf={(id) => model.assetById[id]?.name ?? id}
                  onSelect={(id) => setParam("situation", id === primary?.situation_id ? null : id)}
                />
              ) : null
            }
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

function severityGlyph(sev: string | undefined) {
  return sev === "critical" ? ("critical" as const) : sev === "warning" ? ("high" as const) : ("low" as const);
}

/** Compact list of the active situations; picking one re-targets the Calm Card and map path. */
function SituationSwitcher({
  situations,
  selectedId,
  nameOf,
  onSelect,
}: {
  situations: RuntimeSituation[];
  selectedId: string | null;
  nameOf: (assetId: string) => string;
  onSelect: (situationId: string) => void;
}) {
  return (
    <nav className="cc-switch" aria-label="Active situations">
      <div className="cc-switch__label">{situations.length} active situations</div>
      <ul className="cc-switch__list">
        {situations.map((s) => (
          <li key={s.situation_id}>
            <button
              type="button"
              className="cc-switch__item"
              aria-pressed={s.situation_id === selectedId}
              onClick={() => onSelect(s.situation_id)}
            >
              <PriorityGlyph status={severityGlyph(s.severity)} title={s.severity} />
              <span className="cc-switch__title">{s.title}</span>
              <span className="cc-switch__root">{s.root_asset_name ?? nameOf(s.root_asset_id)}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
