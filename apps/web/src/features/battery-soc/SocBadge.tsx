import type { SocReading } from "./socTypes";

interface SocBadgeProps {
  reading: SocReading;
}

export function SocBadge({ reading }: SocBadgeProps) {
  const { percent, confidence, detail, warnings, tag_id, quality, timestamp } = reading;

  return (
    <section className="soc-badge" aria-label="Battery state of charge">
      <h4 className="soc-badge__title">Battery SOC</h4>
      {confidence === "unavailable" || percent == null ? (
        <p className="soc-badge__unavailable">{detail}</p>
      ) : (
        <p className="soc-badge__value">
          <span className="soc-badge__icon" aria-hidden>
            {confidence === "reported" ? "◆" : "△"}
          </span>
          <span className="data-number">{percent.toFixed(1)}%</span>
          <span className="soc-badge__source">
            {confidence === "reported" ? "reported" : "estimated"}
          </span>
        </p>
      )}
      <p className="soc-badge__meta">
        {tag_id ? `Tag: ${tag_id}` : "No SOC tag"}
        {quality ? ` · Quality: ${quality}` : ""}
        {timestamp ? ` · ${timestamp}` : ""}
      </p>
      {warnings.length > 0 ? (
        <ul className="soc-badge__warnings">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}