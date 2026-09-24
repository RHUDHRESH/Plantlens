import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { AlignedTrend, TrendLimit } from "./trendModel";

export interface PaneSeries {
  tagId: string;
  color: string;
  dash: number[] | null;
  /** Sample-and-hold the last GOOD value to "now" (only when the live tag is GOOD). */
  hold: boolean;
}

export interface ChartTheme {
  text: string;
  muted: string;
  grid: string;
  border: string;
  surface: string;
  sensorBad: string;
  tone: Record<TrendLimit["tone"], string>;
  font: string;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function timeLabel(sec: number, spanS: number): string {
  const d = new Date(sec * 1000);
  const hm = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  return spanS <= 1800 ? `${hm}:${pad2(d.getUTCSeconds())}` : hm;
}

/**
 * One uPlot pane = one unit = one y-axis. Panes share a cursor via uPlot.sync so the readout
 * lines up across units without ever putting two scales on one plot.
 */
export function TrendPane({
  unitLabel,
  series,
  data,
  fromS,
  toS,
  limits,
  theme,
  height,
  syncKey,
  onCursor,
}: {
  unitLabel: string;
  series: PaneSeries[];
  data: AlignedTrend;
  fromS: number;
  toS: number;
  limits: TrendLimit[];
  theme: ChartTheme;
  height: number;
  syncKey: string;
  onCursor: (x: number | null) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);
  const live = useRef({ data, fromS, toS, limits, onCursor });
  live.current = { data, fromS, toS, limits, onCursor };
  const seriesKey = series.map((s) => `${s.tagId}:${s.color}:${s.hold}:${s.dash?.join("-") ?? ""}`).join("|");

  // (Re)create when the series set, theme or unit changes; data updates go through setData.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const width = Math.max(320, host.clientWidth);
    const opts: uPlot.Options = {
      width,
      height,
      padding: [10, 12, 0, 4],
      legend: { show: false },
      cursor: {
        sync: { key: syncKey },
        drag: { x: false, y: false },
        points: { size: 7, width: 2, fill: theme.surface },
      },
      scales: {
        x: { time: true, range: () => [live.current.fromS, live.current.toS] },
        y: {
          range: (_u, min, max) => {
            const vals = [min, max, ...live.current.limits.map((l) => l.value)].filter((v) => Number.isFinite(v));
            let lo = vals.length ? Math.min(...vals) : 0;
            let hi = vals.length ? Math.max(...vals) : 1;
            if (hi - lo < 1e-9) {
              lo -= Math.abs(lo) * 0.1 || 1;
              hi += Math.abs(hi) * 0.1 || 1;
            }
            const pad = (hi - lo) * 0.1;
            return [lo - pad, hi + pad];
          },
        },
      },
      axes: [
        {
          stroke: theme.muted,
          font: theme.font,
          grid: { stroke: theme.grid, width: 1 },
          ticks: { stroke: theme.border, width: 1, size: 4 },
          values: (u, splits) => {
            const span = (u.scales.x?.max ?? 0) - (u.scales.x?.min ?? 0);
            return splits.map((s) => timeLabel(s, span));
          },
        },
        {
          stroke: theme.muted,
          font: theme.font,
          size: 64,
          values: (_u, splits) =>
            unitLabel === "bool"
              ? splits.map((s) => (s === 1 ? "ON" : s === 0 ? "OFF" : ""))
              : splits.map((s) => `${+s.toPrecision(6)}${unitLabel ? ` ${unitLabel}` : ""}`),
          grid: { stroke: theme.grid, width: 1 },
          ticks: { stroke: theme.border, width: 1, size: 4 },
        },
      ],
      series: [
        {},
        ...series.map((s) => ({
          label: s.tagId,
          stroke: s.color,
          width: 2,
          ...(s.dash ? { dash: s.dash } : {}),
          spanGaps: false,
          points: { show: false },
          paths: uPlot.paths.stepped!({ align: 1, extend: s.hold }),
        })),
      ],
      hooks: {
        draw: [
          (u) => {
            const ctx = u.ctx;
            const { left, top, width: w, height: h } = u.bbox;
            const dpr = uPlot.pxRatio;
            ctx.save();
            // Alarm limits: dashed reference lines, labelled with the alarm id (text in ink).
            for (const l of live.current.limits) {
              const y = Math.round(u.valToPos(l.value, "y", true)) + 0.5;
              if (y < top || y > top + h) continue;
              ctx.font = `${Math.round(10.5 * dpr)}px ${theme.font.split("px ")[1] ?? "sans-serif"}`;
              const text = l.label;
              const tw = ctx.measureText(text).width;
              const tx = left + w - tw - 10 * dpr;
              // Line with a gap for its label: "– – – DC_BUS_LOW < 42 –"
              ctx.strokeStyle = theme.tone[l.tone];
              ctx.lineWidth = 1.25 * dpr;
              ctx.setLineDash([6 * dpr, 4 * dpr]);
              ctx.beginPath();
              ctx.moveTo(left, y);
              ctx.lineTo(tx - 6 * dpr, y);
              ctx.moveTo(tx + tw + 6 * dpr, y);
              ctx.lineTo(left + w, y);
              ctx.stroke();
              ctx.setLineDash([]);
              ctx.fillStyle = theme.surface;
              ctx.fillRect(tx - 4 * dpr, y - 7 * dpr, tw + 8 * dpr, 14 * dpr);
              ctx.fillStyle = theme.muted;
              ctx.textAlign = "left";
              ctx.textBaseline = "middle";
              ctx.fillText(text, tx, y);
            }
            // Quality marks: a short purple tick on the baseline under every non-GOOD sample.
            ctx.fillStyle = theme.sensorBad;
            for (const m of live.current.data.qualityMarks) {
              if (!series[m.series]) continue;
              const x = u.valToPos(m.x, "x", true);
              if (x < left || x > left + w) continue;
              ctx.fillRect(x - 1 * dpr, top + h - 6 * dpr, 2 * dpr, 6 * dpr);
            }
            ctx.restore();
          },
        ],
        setCursor: [
          (u) => {
            const idx = u.cursor.idx;
            live.current.onCursor(idx == null ? null : (u.data[0][idx] ?? null));
          },
        ],
      },
    };
    const plot = new uPlot(opts, toUPlotData(live.current.data), host);
    plotRef.current = plot;
    const ro = new ResizeObserver(() => {
      const wNow = Math.max(320, host.clientWidth);
      if (Math.abs(wNow - plot.width) > 1) plot.setSize({ width: wNow, height });
    });
    ro.observe(host);
    return () => {
      ro.disconnect();
      plot.destroy();
      plotRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesKey, theme, unitLabel, height, syncKey]);

  // Cheap live update: new arrays, same plot.
  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    // resetScales re-runs the x range (runtime window) and y auto-range incl. limits.
    plot.setData(toUPlotData(data));
  }, [data, fromS, toS, limits]);

  return <div ref={hostRef} className="tr-pane__plot" />;
}

function toUPlotData(d: AlignedTrend): uPlot.AlignedData {
  return [d.xs, ...d.ys] as unknown as uPlot.AlignedData;
}
