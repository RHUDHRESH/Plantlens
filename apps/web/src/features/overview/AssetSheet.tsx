import { GitBranch, LineChart } from "lucide-react";
import { Link } from "react-router-dom";
import { useTrends } from "../../api/queries";
import type { TagFrame } from "../../app/schemas/tagFrame";
import { EquipmentSymbol, symbolForAssetType } from "../../components/symbols";
import { Mono, PriorityGlyph, StatusBadge } from "../../components/ui/primitives";
import type { AlarmRow } from "../alarms/alarmModel";
import { PRIORITY_LABEL } from "../alarms/alarmModel";
import { AlarmStateLabel } from "../alarms/AlarmStateLabel";
import type { AssetStatus } from "../maps2d/mapTypes";
import { assetStatusKind, assetStatusLabel, formatAge, formatValue, parseTs } from "../operational-map/format";
import type { PlantAsset, PlantModel } from "../operational-map/plantModel";
import { Facts, SectionLabel, SideSheet } from "../operational-map/SideSheet";
import { Sparkline } from "../operational-map/Sparkline";
import { trendsHref, withCarryIn } from "../trends/trendModel";

const WINDOW_S = 15 * 60;

export function AssetSheet({
  asset,
  status,
  model,
  tags,
  alarms,
  now,
  onOpenChange,
}: {
  asset: PlantAsset | null;
  status: AssetStatus;
  model: PlantModel;
  tags: Record<string, TagFrame>;
  alarms: AlarmRow[];
  now: number;
  onOpenChange: (open: boolean) => void;
}) {
  const tagIds = asset?.tags.slice(0, 8) ?? [];
  const trend = useTrends(tagIds, WINDOW_S, 2000);
  if (!asset) return null;
  const toMs = parseTs(trend.data?.now) ?? now;
  const kind = assetStatusKind(status);
  const assetAlarms = alarms.filter((a) => a.assetId === asset.id);

  return (
    <SideSheet
      open
      onOpenChange={onOpenChange}
      title={
        <span className="ops-sheet-title">
          <EquipmentSymbol kind={symbolForAssetType(asset.type)} size={28} status={kind} />
          {asset.name}
        </span>
      }
      subtitle={
        <>
          <Mono>{asset.id}</Mono>
          {asset.type ? ` · ${asset.type}` : ""}
        </>
      }
      badge={<StatusBadge status={kind} label={assetStatusLabel(status)} />}
      footer={
        <>
          {tagIds.length ? (
            <Link className="pl-btn pl-btn--secondary pl-btn--md" to={trendsHref(tagIds)}>
              <LineChart width={15} height={15} aria-hidden /> Trend all tags
            </Link>
          ) : null}
          <Link className="pl-btn pl-btn--ghost pl-btn--md" to={`/ops/causal?asset=${encodeURIComponent(asset.id)}`}>
            <GitBranch width={15} height={15} aria-hidden /> Causal graph
          </Link>
        </>
      }
    >
      <section>
        <SectionLabel aside={assetAlarms.length ? `${assetAlarms.length} active` : undefined}>Alarms</SectionLabel>
        {assetAlarms.length ? (
          <ul className="ops-sheet-alarms">
            {assetAlarms.map((a) => (
              <li key={a.id}>
                <Link to={`/ops/alarms?alarm=${encodeURIComponent(a.id)}`} className="ops-sheet-alarm">
                  <PriorityGlyph status={a.status} title={PRIORITY_LABEL[a.priority]} />
                  <span className="ops-sheet-alarm__msg">{a.message}</span>
                  <AlarmStateLabel state={a.state} />
                  <Mono className="ops-muted">{formatAge(now - a.onsetMs)}</Mono>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ops-empty-inline">No active alarms on this asset.</p>
        )}
      </section>

      <section>
        <SectionLabel aside="last 15 min">Live tags</SectionLabel>
        {tagIds.length ? (
          <ul className="ov-sheet-tags">
            {[...tagIds].sort((a, b) => Number(!tags[a]) - Number(!tags[b])).map((id) => {
              const live = tags[id];
              const unit = model.tagById[id]?.unit ?? live?.unit ?? null;
              const raw = trend.data?.series.find((s) => s.tag_id === id);
              const series = raw ? withCarryIn(raw, live, (toMs - WINDOW_S * 1000) / 1000) : undefined;
              const bad = live && live.quality !== "GOOD";
              return (
                <li key={id} className="ov-sheet-tag">
                  <div className="ov-sheet-tag__head">
                    <Mono className="ov-sheet-tag__id">{id}</Mono>
                    {live ? (
                      <Mono className="ov-sheet-tag__v">{formatValue(live.value, unit)}</Mono>
                    ) : (
                      <span className="ops-subtle ov-sheet-tag__none">no data yet</span>
                    )}
                  </div>
                  {bad ? (
                    <div className="ov-sheet-tag__q">
                      <PriorityGlyph status="sensor_bad" /> Quality {live.quality} — not used as process evidence
                    </div>
                  ) : null}
                  {series?.points.length ? (
                    <Sparkline
                      points={series.points}
                      fromMs={toMs - WINDOW_S * 1000}
                      toMs={toMs}
                      unit={unit}
                      height={34}
                      label={`${id} trend`}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="ops-empty-inline">This asset has no mapped tags.</p>
        )}
      </section>

      <section>
        <SectionLabel>Asset</SectionLabel>
        <Facts
          items={[
            { label: "Criticality", value: asset.criticality ?? "—" },
            { label: "Tags", value: String(asset.tags.length) },
            { label: "Rules on asset", value: String(asset.alarmIds.length) },
          ]}
        />
      </section>
    </SideSheet>
  );
}
