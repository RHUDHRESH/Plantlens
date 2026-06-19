interface RawAlarmDisclosureProps {
  count: number;
  onView?: () => void;
}

export function RawAlarmDisclosure({ count, onView }: RawAlarmDisclosureProps) {
  return (
    <button type="button" className="calm-card__raw-btn" onClick={onView} aria-label="View raw alarms">
      {count} raw alarm{count === 1 ? "" : "s"} grouped — view raw alarms
    </button>
  );
}