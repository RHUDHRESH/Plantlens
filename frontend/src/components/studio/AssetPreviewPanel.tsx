import { Badge } from "../ui/Badge";
import { computeDerivedThresholds } from "./demoAssetTemplates";
import type { AssetTemplate, ValidationItem } from "./studioTypes";
import { AssetValidationPanel } from "./AssetValidationPanel";

interface AssetPreviewPanelProps {
  template: AssetTemplate;
  draftValues: Record<string, number | string>;
  validationItems: ValidationItem[];
}

export function AssetPreviewPanel({
  template,
  draftValues,
  validationItems,
}: AssetPreviewPanelProps) {
  const thresholds = computeDerivedThresholds(template, draftValues);

  return (
    <aside className="pl-studio-preview" aria-label="Live preview">
      <header className="pl-studio-preview__header">
        <h2 className="pl-studio-preview__title">Live Preview</h2>
        <Badge variant="readonly">Model draft</Badge>
      </header>

      <div className="pl-studio-preview__schematic">
        <AssetSchematic template={template} />
      </div>

      <section className="pl-studio-preview__section">
        <span className="pl-label">Signals</span>
        <ul className="pl-studio-preview__signal-list">
          {template.signals.map((s) => (
            <li key={s.key} className="pl-studio-preview__signal">
              <span>{s.label}</span>
              <Badge
                variant={
                  s.status === "bound" || s.status === "derived"
                    ? "success"
                    : s.status === "optional"
                      ? "warning"
                      : "unknown"
                }
              >
                {s.status === "optional" ? "?" : "OK"}
              </Badge>
            </li>
          ))}
        </ul>
      </section>

      <section className="pl-studio-preview__section">
        <span className="pl-label">Derived Thresholds</span>
        <ul className="pl-studio-preview__threshold-list">
          {thresholds.map((t) => (
            <li key={t.key}>
              <span className="pl-studio-preview__threshold-key">{t.label}</span>
              <span className="pl-studio-preview__threshold-val">{t.value}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="pl-studio-preview__section">
        <span className="pl-label">Fault Modes</span>
        <ul className="pl-studio-preview__fault-list">
          {template.faultModes.map((f) => (
            <li key={f.id}>{f.label}</li>
          ))}
        </ul>
      </section>

      <AssetValidationPanel items={validationItems} compact />
    </aside>
  );
}

function AssetSchematic({ template }: { template: AssetTemplate }) {
  const kind = template.assetClass;

  if (kind === "motor") {
    return (
      <svg
        className="pl-studio-schematic"
        viewBox="0 0 200 120"
        aria-label={`${template.label} schematic`}
      >
        <rect x="50" y="30" width="100" height="60" rx="4" className="pl-studio-schematic__body" />
        <rect x="130" y="45" width="20" height="30" rx="2" className="pl-studio-schematic__term" />
        <line x1="150" y1="60" x2="190" y2="60" className="pl-studio-schematic__shaft" />
        <circle cx="190" cy="60" r="6" className="pl-studio-schematic__shaft-end" />
        <text x="100" y="65" textAnchor="middle" className="pl-studio-schematic__label">
          MOTOR
        </text>
        <text x="170" y="52" className="pl-studio-schematic__anno">shaft</text>
      </svg>
    );
  }

  if (kind === "fan") {
    return (
      <svg
        className="pl-studio-schematic"
        viewBox="0 0 200 120"
        aria-label={`${template.label} schematic`}
      >
        <circle cx="80" cy="60" r="35" className="pl-studio-schematic__body" />
        <line x1="80" y1="30" x2="80" y2="90" className="pl-studio-schematic__blade" />
        <line x1="50" y1="60" x2="110" y2="60" className="pl-studio-schematic__blade" />
        <line x1="60" y1="40" x2="100" y2="80" className="pl-studio-schematic__blade" />
        <line x1="60" y1="80" x2="100" y2="40" className="pl-studio-schematic__blade" />
        <rect x="120" y="45" width="50" height="30" rx="3" className="pl-studio-schematic__body" />
        <text x="145" y="65" textAnchor="middle" className="pl-studio-schematic__label">
          FAN
        </text>
      </svg>
    );
  }

  if (kind === "blower") {
    return (
      <svg
        className="pl-studio-schematic"
        viewBox="0 0 200 120"
        aria-label={`${template.label} schematic`}
      >
        <path
          d="M40 70 Q80 20 120 70 Q80 100 40 70"
          className="pl-studio-schematic__body"
          fill="none"
          strokeWidth="3"
        />
        <rect x="120" y="45" width="55" height="35" rx="3" className="pl-studio-schematic__body" />
        <line x1="175" y1="62" x2="195" y2="62" className="pl-studio-schematic__shaft" />
        <text x="147" y="67" textAnchor="middle" className="pl-studio-schematic__label">
          BLOWER
        </text>
      </svg>
    );
  }

  if (kind === "sensor") {
    return (
      <svg
        className="pl-studio-schematic"
        viewBox="0 0 200 120"
        aria-label={`${template.label} schematic`}
      >
        <rect x="70" y="35" width="60" height="50" rx="6" className="pl-studio-schematic__body" />
        <circle cx="100" cy="60" r="12" className="pl-studio-schematic__sensor-eye" />
        <line x1="100" y1="85" x2="100" y2="100" className="pl-studio-schematic__lead" />
        <text x="100" y="62" textAnchor="middle" className="pl-studio-schematic__label-sm">
          SNS
        </text>
      </svg>
    );
  }

  return (
    <svg
      className="pl-studio-schematic"
      viewBox="0 0 200 120"
      aria-label={`${template.label} schematic`}
    >
      <rect x="60" y="40" width="80" height="40" rx="4" className="pl-studio-schematic__body" />
      <text x="100" y="67" textAnchor="middle" className="pl-studio-schematic__label">
        {template.label.toUpperCase()}
      </text>
    </svg>
  );
}