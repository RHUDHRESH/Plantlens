import { cn } from "@/lib/utils";

export type QualityCode = "GOOD" | "STALE" | "BAD" | "MISSING" | "SUSPECT";

const QUALITY_META: Record<QualityCode, { className: string; dot: string }> = {
  GOOD: {
    className: "border-transparent bg-transparent text-ink-500",
    dot: "bg-healthy",
  },
  STALE: {
    className: "border-advisory/30 bg-advisory-tint text-advisory",
    dot: "bg-advisory",
  },
  BAD: {
    className: "border-critical/30 bg-critical-tint text-critical",
    dot: "bg-critical",
  },
  MISSING: {
    className: "border-ink-300/50 bg-surface-sunken text-ink-500",
    dot: "bg-ink-300",
  },
  SUSPECT: {
    className: "border-warning/30 bg-warning-tint text-warning",
    dot: "bg-warning",
  },
};

export interface QualityChipProps {
  quality: QualityCode;
  className?: string;
  /** When true, GOOD shows a quiet status dot only. */
  compact?: boolean;
}

export function QualityChip({ quality, className, compact = true }: QualityChipProps) {
  const meta = QUALITY_META[quality];
  if (compact && quality === "GOOD") {
    return (
      <span
        className={cn("inline-flex items-center", className)}
        data-quality={quality}
        title="GOOD"
        aria-label="GOOD"
      >
        <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide",
        meta.className,
        className,
      )}
      data-quality={quality}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden />
      {quality}
    </span>
  );
}
