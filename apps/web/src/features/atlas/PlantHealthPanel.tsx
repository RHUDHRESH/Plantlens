import { Check } from "lucide-react";
import type { ActiveAlarm } from "../../api/types";
import type { TagFrame } from "../../app/schemas/tagFrame";
import { alarmsInLastTenMinutes, tagNumericValue } from "./treeHelpers";

interface PlantHealthPanelProps {
  tags: Record<string, TagFrame>;
  alarms: ActiveAlarm[];
}

function displayValue(tagId: string, tags: Record<string, TagFrame>, digits = 1): string {
  const value = tagNumericValue(tags[tagId]);
  if (value === null) return "—";
  return digits === 0 ? value.toFixed(0) : value.toFixed(digits);
}

export function PlantHealthPanel({ tags, alarms }: PlantHealthPanelProps) {
  const alarmRate = alarmsInLastTenMinutes(alarms);
  const isFlood = alarmRate > 10;

  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="px-4 py-4 border-b border-line">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-full flex items-center justify-center bg-healthy/15 text-healthy">
            <Check size={14} strokeWidth={1.75} />
          </div>
          <span className="text-base font-semibold text-ink-900">All nominal</span>
        </div>
        <p className="text-xs text-ink-500">
          No active situations · {alarmRate} alarms in last 10 min
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-3">DC Bus</p>
        <div className="mb-6">
          <div className="flex items-baseline gap-1 mb-1">
            <span className="text-[28px] leading-[34px] font-semibold font-mono tabular-nums text-ink-900">
              {displayValue("BUS_101_V", tags)}
            </span>
            <span className="text-xs text-ink-500">V</span>
          </div>
          <div className="text-xs text-ink-500">Nominal: 24V</div>
        </div>

        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-3">Motor M-301</p>
        <div className="space-y-4 mb-6">
          <div>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-base font-semibold font-mono tabular-nums text-ink-900">
                {displayValue("MOTOR_301_RPM", tags, 0)}
              </span>
              <span className="text-xs text-ink-500">RPM</span>
            </div>
            <div className="text-xs text-ink-500">Normal: 800–1200</div>
          </div>
          <div>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-base font-semibold font-mono tabular-nums text-ink-900">
                {displayValue("MOTOR_301_TEMP", tags)}
              </span>
              <span className="text-xs text-ink-500">°C</span>
            </div>
            <div className="text-xs text-ink-500">Normal: 40–75°C</div>
          </div>
          <div>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-base font-semibold font-mono tabular-nums text-ink-900">
                {displayValue("MOTOR_301_VIB", tags)}
              </span>
              <span className="text-xs text-ink-500">mm/s</span>
            </div>
            <div className="text-xs text-ink-500">Normal: &lt;4 mm/s</div>
          </div>
        </div>

        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-3">System Health</p>
        <div className="bg-surface-sunken rounded-lg p-3 mb-4">
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-lg font-semibold font-mono tabular-nums text-ink-900">{alarmRate}</span>
            <span className="text-xs text-ink-500">alarms / 10 min</span>
          </div>
          <div className="text-xs text-ink-500">ISA-18.2 flood threshold: &gt;10 alarms</div>
          <div className={cnHealth(isFlood)}>
            {isFlood ? "Flood active" : "✓ All normal"}
          </div>
        </div>
      </div>
    </div>
  );
}

function cnHealth(isFlood: boolean): string {
  return isFlood
    ? "text-xs mt-2 text-critical"
    : "text-xs mt-2 text-healthy";
}