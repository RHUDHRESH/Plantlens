interface SourceBadgeProps {
  sourceLabel: string;
  lastLoadedAt: string | null;
}

export function SourceBadge({ sourceLabel, lastLoadedAt }: SourceBadgeProps) {
  return (
    <div className="pl-chip hmi-source-badge" aria-label="HMI data source">
      <strong>Source: {sourceLabel}</strong>
      {lastLoadedAt && (
        <span className="hmi-source-badge__time" data-tabular>
          · {lastLoadedAt}
        </span>
      )}
    </div>
  );
}
