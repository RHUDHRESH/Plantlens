interface SourceBadgeProps {
  sourceLabel: string;
  lastLoadedAt: string | null;
}

export function SourceBadge({ sourceLabel, lastLoadedAt }: SourceBadgeProps) {
  return (
    <div className="hmi-source-badge" aria-label="HMI data source">
      <span className="hmi-source-badge__label">Source: {sourceLabel}</span>
      {lastLoadedAt && (
        <span className="hmi-source-badge__time" data-tabular>
          Last loaded {lastLoadedAt}
        </span>
      )}
    </div>
  );
}