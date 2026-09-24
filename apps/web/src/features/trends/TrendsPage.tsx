import { Download, Pause, Play, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAlarmRules, useTrends } from "../../api/queries";
import { useRuntimeStore } from "../../app/store/runtime";
import { Button, EmptyState, ErrorNotice, IconButton, Mono, PageHeader, SegmentedControl } from "../../components/ui/primitives";
import { formatClock, formatDateTime, formatValue, parseTs, unitLabel } from "../operational-map/format";
import { usePlantModel } from "../operational-map/plantModel";
import { useOperateRuntime } from "../operational-map/useRuntimeSeed";
import "../operational-map/ops.css";
import type { ChartTheme, PaneSeries } from "./TrendPane";
import { TrendPane } from "./TrendPane";
import type { TrendRangeKey } from "./trendModel";
import {
  MAX_TAGS,
  TREND_RANGES,
  alignSeries,
  assignSlots,
  extractLimits,
  groupByUnit,
  parseTrendParams,
  rangeSeconds,
  toCsv,
  valueAt,
  withCarryIn,
} from "./trendModel";
import "./trends.css";

const PALETTE_SIZE = 5;
const SYNC_KEY = "pl-trends";

function readTheme(el: HTMLElement | null): { theme: ChartTheme; colors: string[] } {
  const cs = getComputedStyle(el ?? document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    theme: {
      text: v("--text", "#1a1a1e"),
      muted: v("--text-muted", "#5e5e5a"),
      grid: v("--grid", "#e4e4df"),
      border: v("--border-strong", "#c9c9c3"),
      surface: v("--surface", "#ffffff"),
      sensorBad: v("--status-sensor-bad", "#6b5dd3"),
      tone: {
        critical: v("--status-critical", "#c0261d"),
        high: v("--status-high", "#c9570c"),
        medium: v("--status-medium", "#a77f00"),
      },
      font: `11px ${v("--font-sans", "Inter, sans-serif")}`,
    },
    colors: Array.from({ length: PALETTE_SIZE }, (_, i) => v(`--tr-series-${i + 1}`, "#2a78d6")),
  };
}

function useChartTheme(ref: React.RefObject<HTMLElement | null>) {
  const [state, setState] = useState(() => readTheme(null));
  useEffect(() => {
    setState(readTheme(ref.current));
    const mo = new MutationObserver(() => setState(readTheme(ref.current)));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, [ref]);
  return state;
}

export function TrendsPage() {
  useOperateRuntime();
  const [params, setParams] = useSearchParams();
  const { tags: selected, range } = parseTrendParams(params);
  const seconds = rangeSeconds(range);
  const [paused, setPaused] = useState(false);
  const [cursorX, setCursorX] = useState<number | null>(null);
  const [slots, setSlots] = useState<Record<string, number>>({});
  const pageRef = useRef<HTMLDivElement | null>(null);
  const { theme, colors } = useChartTheme(pageRef);
  const { model } = usePlantModel();
  const rules = useAlarmRules();
  const liveTags = useRuntimeStore((s) => s.tags);
  const trends = useTrends(selected, seconds, paused ? 0 : 1500);

  // Freeze what is on screen while paused (the query keeps its last result).
  const frozen = useRef(trends.data);
  if (!paused || !frozen.current) frozen.current = trends.data;
  const data = paused ? frozen.current : trends.data;

  const selectedKey = selected.join(",");
  useEffect(() => {
    setSlots((prev) => assignSlots(prev, selected));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  const setUrl = (next: { tags?: string[]; range?: TrendRangeKey }) => {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        const t = next.tags ?? selected;
        if (t.length) p.set("tags", t.join(","));
        else p.delete("tags");
        p.set("range", next.range ?? range);
        return p;
      },
      { replace: true },
    );
  };
  const toggleTag = (id: string) => {
    if (selected.includes(id)) setUrl({ tags: selected.filter((t) => t !== id) });
    else if (selected.length < MAX_TAGS) setUrl({ tags: [...selected, id] });
  };

  const nowS = (parseTs(data?.now) ?? Date.now()) / 1000;
  const fromS = nowS - seconds;
  const unitOf = (id: string) => data?.series.find((s) => s.tag_id === id)?.unit ?? model.tagById[id]?.unit ?? null;
  const panes = groupByUnit(selected, unitOf);
  const limits = useMemo(() => extractLimits(rules.data?.rules, selected), [rules.data, selectedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const colorOf = (id: string) => {
    const s = slots[id] ?? selected.indexOf(id);
    return { color: colors[s % PALETTE_SIZE] ?? colors[0]!, dash: s >= PALETTE_SIZE ? [7, 4] : null };
  };

  const paneData = useMemo(
    () =>
      panes.map((p) => {
        const series = p.tagIds.map((id) =>
          withCarryIn(
            data?.series.find((s) => s.tag_id === id) ?? { tag_id: id, unit: null, asset_id: null, points: [] },
            liveTags[id],
            fromS,
          ),
        );
        return alignSeries(series);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, liveTags, panes.map((p) => p.tagIds.join(",")).join("|")],
  );

  const exportCsv = () => {
    if (!data) return;
    const blob = new Blob([toCsv(data.series)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plantlens-trend-${range}-${(data.now ?? "").replace(/[:.]/g, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const paneHeight = panes.length <= 1 ? 340 : panes.length === 2 ? 240 : 190;
  const readX = cursorX ?? nowS;

  return (
    <div className="pl-page tr-page" ref={pageRef}>
      <PageHeader
        title="Trends"
        description="Live tag history with alarm limits. One pane per unit; times are the runtime clock (UTC)."
      />
      <div className="tr-layout">
        <TagPicker model={model} selected={selected} onToggle={toggleTag} colorOf={colorOf} liveTags={liveTags} />

        <section className="tr-main" aria-label="Trend chart">
          <div className="tr-toolbar">
            <SegmentedControl
              label="Time range"
              value={range}
              options={TREND_RANGES.map((r) => ({ value: r.key, label: r.label }))}
              onChange={(v) => setUrl({ range: v })}
            />
            <span className="tr-status" aria-live="polite">
              <span className={`pl-dot ${paused ? "pl-dot--stale" : trends.isError ? "pl-dot--down" : "pl-dot--live"}`} aria-hidden />
              {paused ? "Paused" : trends.isError ? "Update failed" : "Live"}
              {data?.now ? (
                <>
                  {" · "}
                  <Mono>{formatClock(data.now)}</Mono>
                </>
              ) : null}
            </span>
            <div className="tr-toolbar__spacer" />
            <Button size="sm" icon={paused ? <Play /> : <Pause />} onClick={() => setPaused((p) => !p)} disabled={!selected.length} aria-pressed={paused}>
              {paused ? "Resume" : "Pause"}
            </Button>
            <Button size="sm" icon={<Download />} onClick={exportCsv} disabled={!data?.series.length}>
              Export CSV
            </Button>
            {selected.length ? (
              <Button size="sm" variant="ghost" onClick={() => setUrl({ tags: [] })}>
                Clear
              </Button>
            ) : null}
          </div>
          {trends.error && !data ? <ErrorNotice error={trends.error} /> : null}

          {!selected.length ? (
            <EmptyState title="Pick tags to trend">
              Choose up to {MAX_TAGS} tags on the left. Tags in alarm are listed first. Trends are linkable — the URL keeps
              the tags and range.
            </EmptyState>
          ) : (
            <div className="tr-panes" onMouseLeave={() => setCursorX(null)}>
              {panes.map((p, pi) => {
                const aligned = paneData[pi]!;
                const paneSeries: PaneSeries[] = p.tagIds.map((id) => ({
                  tagId: id,
                  ...colorOf(id),
                  hold: !paused && (liveTags[id]?.quality ?? "GOOD") === "GOOD",
                }));
                const paneLimits = limits.filter((l) => p.tagIds.includes(l.tagId));
                return (
                  <div className="tr-pane" key={p.unit || `pane-${pi}`}>
                    <ul className="tr-legend" aria-label={`Series in ${unitLabel(p.unit) || "unitless"} pane`}>
                      {p.tagIds.map((id, si) => {
                        const c = colorOf(id);
                        const r = valueAt(aligned.xs, aligned.ys[si] ?? [], readX);
                        const tag = model.tagById[id];
                        return (
                          <li key={id} className="tr-legend__item">
                            <svg className="tr-key" width="18" height="8" aria-hidden>
                              <line x1="1" x2="17" y1="4" y2="4" stroke={c.color} strokeWidth="2.5" strokeDasharray={c.dash?.join(" ")} />
                            </svg>
                            <span className="tr-legend__v">
                              {r ? (r.gap ? <span className="tr-bad">no GOOD value</span> : formatValue(r.value, p.unit)) : "—"}
                            </span>
                            <Mono className="tr-legend__id">{id}</Mono>
                            <span className="ops-subtle tr-legend__asset">{tag?.assetId ? (model.assetById[tag.assetId]?.name ?? tag.assetId) : ""}</span>
                          </li>
                        );
                      })}
                      {paneLimits.length ? (
                        <li className="tr-legend__item tr-legend__limit">
                          <svg className="tr-key" width="18" height="8" aria-hidden>
                            <line x1="1" x2="17" y1="4" y2="4" stroke={theme.muted} strokeWidth="1.5" strokeDasharray="4 3" />
                          </svg>
                          <span className="ops-muted">alarm limit</span>
                        </li>
                      ) : null}
                    </ul>
                    <TrendPane
                      unitLabel={p.unit === "bool" ? "bool" : unitLabel(p.unit)}
                      series={paneSeries}
                      data={aligned}
                      fromS={fromS}
                      toS={nowS}
                      limits={paneLimits}
                      theme={theme}
                      height={paneHeight}
                      syncKey={SYNC_KEY}
                      onCursor={setCursorX}
                    />
                  </div>
                );
              })}
              <p className="tr-foot ops-subtle">
                {cursorX ? (
                  <>
                    Cursor <Mono>{formatDateTime(cursorX * 1000)}</Mono> UTC
                  </>
                ) : (
                  <>Values shown are the latest samples. Hover a chart to read any instant.</>
                )}{" "}
                · Lines hold the last sample (step) · breaks and purple ticks mark non-GOOD quality
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function TagPicker({
  model,
  selected,
  onToggle,
  colorOf,
  liveTags,
}: {
  model: ReturnType<typeof usePlantModel>["model"];
  selected: string[];
  onToggle: (id: string) => void;
  colorOf: (id: string) => { color: string; dash: number[] | null };
  liveTags: Record<string, { value: unknown; quality: string; unit: string }>;
}) {
  const [q, setQ] = useState("");
  const alarms = useRuntimeStore((s) => s.activeAlarms);
  const alarmed = useMemo(() => [...new Set(alarms.map((a) => a.tag_id))], [alarms]);
  const query = q.trim().toLowerCase();
  const groups = useMemo(() => {
    const out: { id: string; title: string; tags: string[] }[] = [];
    if (alarmed.length && !query) out.push({ id: "__alarm", title: "In alarm", tags: alarmed });
    for (const a of model.assets) {
      const tags = a.tags.filter((t) => !query || `${t} ${a.name} ${a.id}`.toLowerCase().includes(query));
      if (tags.length) out.push({ id: a.id, title: a.name, tags });
    }
    return out;
  }, [model.assets, alarmed, query]);
  const full = selected.length >= MAX_TAGS;

  return (
    <aside className="tr-picker" aria-label="Tag picker">
      <div className="tr-picker__head">
        <label className="tr-search">
          <Search aria-hidden />
          <input className="pl-input" type="search" placeholder="Search tags or assets" aria-label="Search tags" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="tr-picker__count ops-muted">
          <Mono>
            {selected.length}/{MAX_TAGS}
          </Mono>{" "}
          selected
        </div>
      </div>
      {selected.length ? (
        <ul className="tr-chips" aria-label="Selected tags">
          {selected.map((id) => {
            const c = colorOf(id);
            return (
              <li key={id} className="tr-chip">
                <svg className="tr-key" width="14" height="8" aria-hidden>
                  <line x1="1" x2="13" y1="4" y2="4" stroke={c.color} strokeWidth="2.5" strokeDasharray={c.dash?.join(" ")} />
                </svg>
                <Mono>{id}</Mono>
                <IconButton label={`Remove ${id}`} icon={<X />} size="sm" onClick={() => onToggle(id)} />
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="tr-picker__list">
        {groups.map((g) => (
          <fieldset key={g.id} className="tr-group">
            <legend>{g.title}</legend>
            {g.tags.map((id) => {
              const on = selected.includes(id);
              const live = liveTags[id];
              const unit = model.tagById[id]?.unit ?? null;
              return (
                <label key={`${g.id}-${id}`} className={`tr-tag${on ? " is-on" : ""}${!on && full ? " is-disabled" : ""}`}>
                  <input type="checkbox" checked={on} disabled={!on && full} onChange={() => onToggle(id)} />
                  <Mono className="tr-tag__id">{id}</Mono>
                  <span className="tr-tag__v">{live ? formatValue(live.value, unit) : ""}</span>
                </label>
              );
            })}
          </fieldset>
        ))}
        {!groups.length ? <p className="ops-empty-inline" style={{ padding: 12 }}>No tags match “{q}”.</p> : null}
      </div>
      {full ? <p className="tr-picker__full ops-muted">{MAX_TAGS} tags is the limit — remove one to add another.</p> : null}
    </aside>
  );
}
