import { cn } from "@/lib/utils";
import { QualityChip, type QualityCode } from "./QualityChip";

export interface SignalCellProps {
  tag_id: string;
  value: number | string | boolean | null;
  unit?: string;
  quality: QualityCode;
  className?: string;
}

function formatValue(value: number | string | boolean | null): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return String(value);
}

export function SignalCell({ tag_id, value, unit, quality, className }: SignalCellProps) {
  const degraded = quality !== "GOOD";
  return (
    <div
      className={cn(
        "flex min-w-0 items-center justify-between gap-3 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2",
        degraded && "border-[var(--line-strong)] bg-[var(--surface-sunken)]",
        className,
      )}
      data-tag-id={tag_id}
      data-quality={quality}
    >
      <div className="min-w-0 flex flex-col gap-0.5">
        <span className="truncate font-mono text-[11px] text-[var(--ink-500)]">{tag_id}</span>
        <span className="font-mono text-sm font-semibold tabular-nums text-[var(--ink-900)]">
          {formatValue(value)}
          {unit ? (
            <span className="ml-1 text-[11px] font-normal text-[var(--ink-500)]">{unit}</span>
          ) : null}
        </span>
      </div>
      <QualityChip quality={quality} />
    </div>
  );
}
