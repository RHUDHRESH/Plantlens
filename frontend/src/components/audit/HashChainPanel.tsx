import { useStore } from "../../store/useStore";
import { DEMO_HASH_CHAIN } from "./demoAuditData";

const STATUS_LABELS = {
  verified: "VERIFIED",
  warning: "WARNING",
  failed: "FAILED",
  unknown: "UNKNOWN",
} as const;

export function HashChainPanel() {
  const { hashChainStatus } = useStore();

  return (
    <section className="pl-audit-hash" aria-label="Hash chain integrity">
      <h3 className="pl-audit-hash__title">Chain integrity</h3>
      <p className="pl-audit-hash__demo-tag">Demo preview — not backend cryptographic proof</p>

      <div className="pl-audit-hash__path">
        {DEMO_HASH_CHAIN.map((step, i) => (
          <span key={step.id} className="pl-audit-hash__step">
            {i > 0 && <span className="pl-audit-hash__arrow" aria-hidden="true"> → </span>}
            <span className={`pl-audit-hash__link pl-audit-hash__link--${step.status}`}>
              {step.label}
            </span>
          </span>
        ))}
      </div>

      <dl className="pl-audit-hash__hashes">
        {DEMO_HASH_CHAIN.map((step) => (
          <div key={step.id}>
            <dt>{step.label}</dt>
            <dd>
              <code>{step.hash}</code>
              <span className="pl-audit-hash__step-status" aria-hidden="true">
                {step.status === "verified" ? "✓" : "!"}
              </span>
            </dd>
          </div>
        ))}
      </dl>

      <p className={`pl-audit-hash__status pl-audit-hash__status--${hashChainStatus}`}>
        Hash chain: {STATUS_LABELS[hashChainStatus]}
      </p>
    </section>
  );
}