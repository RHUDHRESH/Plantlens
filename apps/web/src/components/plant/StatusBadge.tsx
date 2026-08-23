import { cn } from "@/lib/utils";

export type PlantStatus = "normal" | "warning" | "critical" | "sensor_bad" | "offline";

const STATUS_META: Record<
  PlantStatus,
  { label: string; className: string; icon: string }
> = {
  normal: {
    label: "Normal",
    className: "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-700)]",
    icon: "●",
  },
  warning: {
    label: "Warning",
    className: "border-[var(--warning)] bg-[var(--warning-tint)] text-[var(--warning)]",
    icon: "⚠",
  },
  critical: {
    label: "Critical",
    className: "border-[var(--critical)] bg-[var(--critical-tint)] text-[var(--critical)]",
    icon: "✕",
  },
  sensor_bad: {
    label: "Sensor bad",
    className: "border-[var(--advisory)] bg-[var(--advisory-tint)] text-[var(--advisory)]",
    icon: "◎",
  },
  offline: {
    label: "Offline",
    className: "border-[var(--ink-300)] bg-[var(--surface-sunken)] text-[var(--ink-300)]",
    icon: "○",
  },
};

export interface StatusBadgeProps {
  status: PlantStatus;
  label?: string;
  className?: string;
  showIcon?: boolean;
}

export function StatusBadge({
  status,
  label,
  className,
  showIcon = true,
}: StatusBadgeProps) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2.5 h-6 text-[11px] font-semibold uppercase tracking-wide",
        meta.className,
        className,
      )}
      data-status={status}
    >
      {showIcon ? (
        <span className="text-[10px] leading-none opacity-80" aria-hidden>
          {meta.icon}
        </span>
      ) : null}
      {label ?? meta.label}
    </span>
  );
}
