import { cn } from "../../lib/cn";
import { formatClock, formatDateTime, timeTitle, toMs } from "../../lib/time";

/**
 * An absolute plant/runtime timestamp in the viewer's local zone (same as the top-bar clock), with
 * the full date, zone abbreviation and UTC offset on hover. Tabular figures.
 */
export function Time({
  value,
  format = "clock",
  tenths = false,
  className,
}: {
  value: string | number | Date | null | undefined;
  format?: "clock" | "datetime";
  tenths?: boolean;
  className?: string;
}) {
  const ms = toMs(value);
  if (ms === null) return <span className={cn("pl-mono", className)}>—</span>;
  const text = format === "datetime" ? formatDateTime(ms) : formatClock(ms, tenths);
  return (
    <time className={cn("pl-mono", className)} dateTime={new Date(ms).toISOString()} title={timeTitle(ms)}>
      {text}
    </time>
  );
}
