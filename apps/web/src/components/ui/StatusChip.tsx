import { cn } from "../../lib/cn";

type StatusChipVariant = "healthy" | "advisory" | "warning" | "critical";

const VARIANT_CLASS: Record<StatusChipVariant, string> = {
  healthy: "bg-surface-sunken text-ink-700",
  advisory: "bg-advisory-tint text-advisory",
  warning: "bg-warning-tint text-warning",
  critical: "bg-critical-tint text-critical",
};

interface StatusChipProps {
  variant: StatusChipVariant;
  label: string;
  className?: string;
}

export function StatusChip({ variant, label, className }: StatusChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 h-6 px-2.5 rounded-pill text-[11px] font-semibold uppercase tracking-wide",
        VARIANT_CLASS[variant],
        className,
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" aria-hidden />
      {label}
    </span>
  );
}