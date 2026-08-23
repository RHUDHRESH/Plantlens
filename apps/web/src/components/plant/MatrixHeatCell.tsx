import { cn } from "@/lib/utils";

export type MatrixMatchState = "exact" | "partial" | "contradict" | "missing" | "none";

const MATCH_META: Record<
  MatrixMatchState,
  { label: string; className: string; symbol: string }
> = {
  exact: {
    label: "Exact",
    className: "border-healthy/35 bg-healthy/12 text-healthy",
    symbol: "●",
  },
  partial: {
    label: "Partial",
    className: "border-advisory/35 bg-advisory-tint text-advisory",
    symbol: "◐",
  },
  contradict: {
    label: "Contradict",
    className: "border-critical/35 bg-critical-tint text-critical",
    symbol: "✕",
  },
  missing: {
    label: "Missing",
    className: "border-ink-300/60 bg-surface-sunken text-ink-500",
    symbol: "○",
  },
  none: {
    label: "None",
    className: "border-transparent bg-transparent text-ink-300",
    symbol: "·",
  },
};

export interface MatrixHeatCellProps {
  match: MatrixMatchState;
  weight?: number;
  className?: string;
  title?: string;
}

function clampWeight(weight: number | undefined): number {
  if (weight == null || Number.isNaN(weight)) return 0;
  return Math.max(0, Math.min(1, weight));
}

export function MatrixHeatCell({ match, weight, className, title }: MatrixHeatCellProps) {
  const meta = MATCH_META[match];
  const w = clampWeight(weight);
  const intensity =
    match === "none" || match === "missing" ? undefined : Math.max(0.55, 0.45 + w * 0.55);

  return (
    <div
      className={cn(
        "relative flex size-6 items-center justify-center rounded-[5px] border text-[10px] font-semibold leading-none",
        meta.className,
        className,
      )}
      style={intensity != null ? { opacity: intensity } : undefined}
      title={title ?? `${meta.label}${weight != null ? ` · ${w.toFixed(2)}` : ""}`}
      data-match={match}
      data-weight={weight != null ? String(w) : undefined}
      role="img"
      aria-label={title ?? `${meta.label} match${weight != null ? `, weight ${w.toFixed(2)}` : ""}`}
    >
      <span aria-hidden>{meta.symbol}</span>
    </div>
  );
}
