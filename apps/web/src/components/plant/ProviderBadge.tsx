import { cn } from "@/lib/utils";

export type ProviderState = "live" | "degraded" | "offline";

const PROVIDER_META: Record<
  ProviderState,
  { label: string; className: string; dot: string }
> = {
  live: {
    label: "Live",
    className: "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-700)]",
    dot: "bg-[var(--healthy)]",
  },
  degraded: {
    label: "Degraded",
    className: "border-[var(--advisory)]/40 bg-[var(--advisory-tint)] text-[var(--advisory)]",
    dot: "bg-[var(--advisory)]",
  },
  offline: {
    label: "Offline",
    className: "border-[var(--ink-300)] bg-[var(--surface-sunken)] text-[var(--ink-500)]",
    dot: "bg-[var(--ink-300)]",
  },
};

export interface ProviderBadgeProps {
  state: ProviderState;
  label?: string;
  className?: string;
  onClick?: () => void;
}

export function ProviderBadge({ state, label, className, onClick }: ProviderBadgeProps) {
  const meta = PROVIDER_META[state];
  const classes = cn(
    "inline-flex items-center gap-1.5 rounded-sm border px-2.5 h-6 text-[11px] font-semibold uppercase tracking-wide",
    meta.className,
    onClick && "cursor-pointer hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
    className,
  );
  const content = (
    <>
      <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden />
      {label ?? meta.label}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        data-provider={state}
        data-testid="provider-badge"
        onClick={onClick}
        title="Open Copilot"
        aria-label={`Advisor ${label ?? meta.label} — open Copilot`}
      >
        {content}
      </button>
    );
  }

  return (
    <span className={classes} data-provider={state} data-testid="provider-badge">
      {content}
    </span>
  );
}
