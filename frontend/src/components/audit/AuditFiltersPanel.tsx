import { useStore } from "../../store/useStore";
import type { AuditFilter } from "./auditTypes";

const FILTERS: { id: AuditFilter; label: string }[] = [
  { id: "all", label: "All events" },
  { id: "runtime", label: "Runtime" },
  { id: "modelDrafts", label: "Model drafts" },
  { id: "aiProposals", label: "AI proposals" },
  { id: "acknowledgements", label: "Acknowledgements" },
  { id: "blockedTools", label: "Blocked tools" },
];

export function AuditFiltersPanel() {
  const { auditFilter, setAuditFilter } = useStore();

  return (
    <fieldset className="pl-audit-filters">
      <legend className="pl-audit-filters__legend">Filters</legend>
      <ul className="pl-audit-filters__list" role="radiogroup" aria-label="Audit event filters">
        {FILTERS.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              role="radio"
              aria-checked={auditFilter === f.id}
              className={[
                "pl-audit-filters__option",
                auditFilter === f.id ? "pl-audit-filters__option--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setAuditFilter(f.id)}
            >
              <span className="pl-audit-filters__marker" aria-hidden="true">
                {auditFilter === f.id ? "●" : "○"}
              </span>
              {f.label}
            </button>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}