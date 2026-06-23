import { List } from "lucide-react";
import type { ActiveAlarm } from "../../api/types";
import type { Situation } from "../../app/schemas/situation";
import { cn } from "../../lib/cn";
import { alarmsInLastTenMinutes } from "./treeHelpers";

interface StatusStripProps {
  situations: Situation[];
  alarms: ActiveAlarm[];
  plantHealthy: boolean;
  degradedTagCount?: number;
  onViewRawAlarms: () => void;
}

export function StatusStrip({
  situations,
  alarms,
  plantHealthy,
  degradedTagCount = 0,
  onViewRawAlarms,
}: StatusStripProps) {
  const situationCount = situations.length;
  const alarmRate = alarmsInLastTenMinutes(alarms);
  const isFlood = alarmRate > 10;
  const liveDataDegraded = degradedTagCount > 0 && situationCount === 0 && alarms.length === 0;

  return (
    <footer
      className="h-12 shrink-0 border-t border-line bg-surface-sunken flex items-center justify-between px-6 gap-4"
      aria-label="Plant status"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-[11px] font-semibold uppercase tracking-wide",
            liveDataDegraded
              ? "bg-advisory-tint text-advisory"
              : plantHealthy && situationCount === 0
                ? "bg-healthy/10 text-healthy"
                : "bg-critical-tint text-critical",
          )}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden />
          {liveDataDegraded
            ? "Live data degraded"
            : plantHealthy && situationCount === 0
              ? "All nominal"
              : `${situationCount} situation${situationCount === 1 ? "" : "s"} active`}
        </span>
        <span className="text-xs text-ink-500 hidden sm:inline">
          {liveDataDegraded
            ? `${degradedTagCount} tag(s) not good`
            : situationCount === 0
              ? "Plant healthy"
              : "Review situation panel"}
        </span>
      </div>

      <div className="flex items-center gap-2 text-xs text-ink-700">
        <span className="font-mono tabular-nums">Alarm rate: {alarmRate} / 10 min</span>
        {isFlood && <span className="text-critical font-medium">· flood active</span>}
      </div>

      <button
        type="button"
        className="flex items-center gap-1.5 text-xs text-accent border border-line rounded-md px-3 py-1.5 bg-surface hover:bg-surface-sunken shrink-0"
        onClick={onViewRawAlarms}
      >
        <List size={14} strokeWidth={1.75} />
        View raw alarms ({alarms.length})
      </button>
    </footer>
  );
}