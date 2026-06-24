import type { LayoutValidationIssue } from "./layoutStudioTypes";

interface LayoutValidationPanelProps {
  items: LayoutValidationIssue[];
  compact?: boolean;
}

function severityMarker(severity: LayoutValidationIssue["severity"]): string {
  switch (severity) {
    case "info":
      return "✓";
    case "warning":
      return "!";
    case "error":
      return "×";
  }
}

function severityClass(severity: LayoutValidationIssue["severity"]): string {
  return `pl-layout-validation__item--${severity}`;
}

export function LayoutValidationPanel({ items, compact = false }: LayoutValidationPanelProps) {
  const blockCount = items.find((i) => i.id === "v-info-blocks")?.message ?? "—";
  const connCount = items.find((i) => i.id === "v-info-conn")?.message ?? "—";
  const missingBindings = items.filter(
    (i) => i.severity === "error" && i.message.includes("missing required binding"),
  ).length;
  const hmiReady = items.some(
    (i) => i.id === "v-info-hmi" || i.message.includes("HMI preview"),
  );

  return (
    <div className={`pl-layout-validation ${compact ? "pl-layout-validation--compact" : ""}`}>
      {!compact && <h4 className="pl-layout-validation__title">Validation</h4>}

      <ul className="pl-layout-validation__counts" aria-label="Validation summary counts">
        <li>
          <span className="pl-layout-validation__marker" aria-hidden="true">✓</span>
          {blockCount}
        </li>
        <li>
          <span className="pl-layout-validation__marker" aria-hidden="true">✓</span>
          {connCount}
        </li>
        {missingBindings > 0 && (
          <li>
            <span className="pl-layout-validation__marker pl-layout-validation__marker--warn" aria-hidden="true">!</span>
            {missingBindings} missing binding{missingBindings === 1 ? "" : "s"}
          </li>
        )}
        <li>
          <span
            className={`pl-layout-validation__marker ${hmiReady ? "" : "pl-layout-validation__marker--muted"}`}
            aria-hidden="true"
          >
            {hmiReady ? "✓" : "○"}
          </span>
          {hmiReady ? "HMI preview available" : "HMI preview pending validation"}
        </li>
      </ul>

      <ul className="pl-layout-validation__list" aria-label="Validation issues">
        {items.map((item) => (
          <li
            key={item.id}
            className={["pl-layout-validation__item", severityClass(item.severity)].join(" ")}
          >
            <span className="pl-layout-validation__marker" aria-hidden="true">
              {severityMarker(item.severity)}
            </span>
            <span>{item.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}