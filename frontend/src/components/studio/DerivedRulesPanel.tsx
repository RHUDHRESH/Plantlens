import type { DerivedRule } from "./studioTypes";
import { computeDerivedResults } from "./demoAssetTemplates";
import type { AssetTemplate } from "./studioTypes";

interface DerivedRulesPanelProps {
  template: AssetTemplate;
  draftValues: Record<string, number | string>;
}

export function DerivedRulesPanel({ template, draftValues }: DerivedRulesPanelProps) {
  const results = computeDerivedResults(template, draftValues);

  return (
    <section className="pl-studio-derived">
      <span className="pl-label">Derived Rules</span>
      <p className="pl-studio-derived__hint">
        Thresholds compile from parameters — no runtime eval.
      </p>
      <ul className="pl-studio-derived__list">
        {template.derivedRules.map((rule: DerivedRule) => (
          <li key={rule.id} className="pl-studio-derived__item">
            <code className="pl-studio-derived__expr">{rule.expression}</code>
            <span className="pl-studio-derived__result">
              → {results[rule.resultKey] ?? "—"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}