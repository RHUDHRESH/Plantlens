import type { CompilerValidationItem, HmiCompilerSummary } from "./hmiCompilerTypes";

interface CompilerValidationPanelProps {
  items: CompilerValidationItem[];
  summary: HmiCompilerSummary;
  compact?: boolean;
}

function severityMarker(severity: CompilerValidationItem["severity"]): string {
  switch (severity) {
    case "info":
      return "✓";
    case "warning":
      return "!";
    case "error":
      return "×";
  }
}

export function CompilerValidationPanel({
  items,
  summary,
  compact = false,
}: CompilerValidationPanelProps) {
  return (
    <section
      className={`pl-hmi-compiler-validation ${compact ? "pl-hmi-compiler-validation--compact" : ""}`}
      aria-label="Compiler validation"
    >
      {!compact && <h3 className="pl-hmi-compiler-validation__title">Validation</h3>}

      <ul className="pl-hmi-compiler-validation__counts">
        <li>
          <span aria-hidden="true">✓</span> {summary.screensGenerated} screens generated
        </li>
        <li>
          <span aria-hidden="true">✓</span> {summary.widgetsGenerated} widgets bound
        </li>
        <li>
          <span aria-hidden="true">✓</span> {summary.bindingsCreated} bindings created
        </li>
        <li>
          <span aria-hidden="true">✓</span> {summary.roleVariants} role variants
        </li>
        <li>
          <span aria-hidden="true">✓</span> {summary.deviceVariants} device variants
        </li>
      </ul>

      <ul className="pl-hmi-compiler-validation__list">
        {items.map((item) => (
          <li
            key={item.id}
            className={`pl-hmi-compiler-validation__item pl-hmi-compiler-validation__item--${item.severity}`}
          >
            <span className="pl-hmi-compiler-validation__marker" aria-hidden="true">
              {severityMarker(item.severity)}
            </span>
            <span>{item.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}