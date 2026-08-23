import { QualityChip, type QualityCode } from "../../components/plant";
import { cn } from "@/lib/utils";
import type { TagFrame } from "../../app/schemas/tagFrame";
import type { TagQuality } from "../../app/schemas/common";

export interface SignalRailProps {
  tags: Record<string, TagFrame>;
  orientation?: "horizontal" | "vertical";
  className?: string;
  /** Prefer these tag ids (order preserved); remaining tags append sorted. */
  preferTagIds?: string[];
  maxItems?: number;
}

function toQualityCode(quality: TagQuality): QualityCode {
  if (quality === "UNCERTAIN") return "SUSPECT";
  return quality;
}

function formatValue(value: TagFrame["value"]): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return String(value);
}

/** Lower rank = higher priority in the rail (bad/stale first). */
function qualityRank(quality: TagQuality): number {
  switch (quality) {
    case "BAD":
      return 0;
    case "STALE":
      return 1;
    case "MISSING":
      return 2;
    case "UNCERTAIN":
      return 3;
    default:
      return 4;
  }
}

function formatAgeHint(timestamp: string, nowMs: number = Date.now()): string | null {
  const ts = Date.parse(timestamp);
  if (Number.isNaN(ts)) return null;
  const ageSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (ageSec < 60) return `${ageSec}s ago`;
  if (ageSec < 3600) return `${Math.floor(ageSec / 60)}m ago`;
  if (ageSec < 86400) return `${Math.floor(ageSec / 3600)}h ago`;
  return `${Math.floor(ageSec / 86400)}d ago`;
}

function orderedFrames(
  tags: Record<string, TagFrame>,
  preferTagIds: string[] | undefined,
): TagFrame[] {
  const preferIndex = new Map((preferTagIds ?? []).map((id, i) => [id, i]));
  return Object.values(tags).sort((a, b) => {
    const qDiff = qualityRank(a.quality) - qualityRank(b.quality);
    if (qDiff !== 0) return qDiff;
    const ai = preferIndex.has(a.tag_id) ? preferIndex.get(a.tag_id)! : Number.MAX_SAFE_INTEGER;
    const bi = preferIndex.has(b.tag_id) ? preferIndex.get(b.tag_id)! : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.tag_id.localeCompare(b.tag_id);
  });
}

export function SignalRail({
  tags,
  orientation = "horizontal",
  className,
  preferTagIds,
  maxItems,
}: SignalRailProps) {
  const allFrames = orderedFrames(tags, preferTagIds);
  const totalCount = allFrames.length;
  const frames = maxItems != null ? allFrames.slice(0, maxItems) : allFrames;
  const hiddenCount = Math.max(0, totalCount - frames.length);
  const vertical = orientation === "vertical";

  return (
    <section
      className={cn(
        "signal-rail border border-line rounded-md bg-surface",
        className,
      )}
      aria-label="Live signal rail"
      data-testid="signal-rail"
      data-orientation={orientation}
    >
      <div className="flex items-baseline justify-between gap-3 px-3 py-1.5">
        <h2 className="sr-only">Signals</h2>
        <span className="font-mono text-[10px] uppercase tracking-wide text-ink-500">
          {totalCount} live tags
        </span>
      </div>

      {frames.length === 0 ? (
        <p className="px-3 pb-3 text-xs text-ink-500" role="status">
          Waiting for live tags…
        </p>
      ) : (
        <ul
          className={cn(
            vertical
              ? "flex flex-col divide-y divide-line"
              : "flex flex-row overflow-x-auto divide-x divide-line",
          )}
        >
          {frames.map((frame) => {
            const quality = toQualityCode(frame.quality);
            const ageHint =
              frame.quality !== "GOOD" ? formatAgeHint(frame.timestamp) : null;
            return (
              <li
                key={frame.tag_id}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 px-3 py-2",
                  vertical ? "w-full" : "min-w-[8.75rem]",
                  quality !== "GOOD" && "bg-surface-sunken/70",
                )}
                data-tag-id={frame.tag_id}
                data-quality={quality}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[10px] uppercase tracking-wide text-ink-500">
                    {frame.tag_id}
                  </div>
                  <div className="font-mono text-[15px] font-semibold tabular-nums leading-tight text-ink-900">
                    {formatValue(frame.value)}
                    {frame.unit ? (
                      <span className="ml-1 text-[10px] font-medium text-ink-500">
                        {frame.unit}
                      </span>
                    ) : null}
                  </div>
                  {ageHint ? (
                    <div
                      className="font-mono text-[10px] text-ink-500"
                      data-testid={`signal-age-${frame.tag_id}`}
                    >
                      {ageHint}
                    </div>
                  ) : null}
                </div>
                <QualityChip quality={quality} />
              </li>
            );
          })}
          {hiddenCount > 0 ? (
            <li
              className={cn(
                "flex shrink-0 items-center px-3 py-2 text-[11px] font-semibold text-ink-500",
                vertical ? "w-full justify-center" : "min-w-[4.5rem] justify-center",
              )}
              data-testid="signal-rail-more"
              aria-label={`${hiddenCount} more signals`}
            >
              +{hiddenCount}
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
}
