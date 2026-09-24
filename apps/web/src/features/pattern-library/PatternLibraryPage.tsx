import { LibraryBig, Search, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { usePattern, usePatternLibraries } from "../../api/queries";
import { EquipmentSymbol } from "../../components/symbols";
import { EmptyState, ErrorNotice, IconButton, PageHeader, PriorityGlyph } from "../../components/ui/primitives";
import { Toast } from "../approvals/engUi";
import type { ToastMessage } from "../approvals/engUi";
import { ApplyToAssetDialog } from "./ApplyToAsset";
import { PatternDetailView } from "./PatternDetail";
import { categoriesOf, failureModeOf, humanize, searchPatterns, severityLabel, severityStatus, shortName, symbolForLibrary } from "./libraryModel";
import "../approvals/approvals.css";
import "./pattern-library.css";

export function PatternLibraryPage() {
  const { patternId } = useParams<{ patternId?: string }>();
  const [params, setParams] = useSearchParams();
  const libs = usePatternLibraries();
  const detail = usePattern(patternId ?? null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const dismiss = useCallback(() => setToast(null), []);

  const libraries = useMemo(() => libs.data?.libraries ?? [], [libs.data]);
  const query = params.get("q") ?? "";
  const componentType = params.get("type");
  const category = params.get("cat");
  const severity = params.get("sev");
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const hits = useMemo(
    () => searchPatterns(libraries, { query, componentType, category, severity }),
    [libraries, query, componentType, category, severity],
  );
  const categories = useMemo(() => categoriesOf(libraries), [libraries]);
  const activeLibrary = libraries.find((l) => l.component_type === (detail.data?.component_type ?? componentType));
  const qs = params.toString() ? `?${params.toString()}` : "";

  return (
    <div className="pl-page plib-page">
      <PageHeader
        title="Pattern library"
        description="How each component type fails: symptoms and their timing, the internal mechanism, how it spreads and how to tell look-alikes apart. Applying a pattern drafts a change set for engineer review."
        meta={libs.data ? <span><strong>{libs.data.pattern_count}</strong> patterns · <strong>{libraries.length}</strong> component types</span> : null}
      />
      {libs.error ? <ErrorNotice error={libs.error} /> : null}
      <div className="plib-layout">
        <nav className="plib-rail pl-panel" aria-label="Component types">
          <button
            type="button"
            className={`plib-rail__item${!componentType ? " is-on" : ""}`}
            aria-pressed={!componentType}
            onClick={() => setParam("type", null)}
          >
            <span className="plib-rail__sym"><LibraryBig aria-hidden /></span>
            <span className="plib-rail__name">All component types</span>
            <span className="plib-rail__count">{libs.data?.pattern_count ?? "…"}</span>
          </button>
          {libraries.map((lib) => (
            <button
              key={lib.component_type}
              type="button"
              className={`plib-rail__item${componentType === lib.component_type ? " is-on" : ""}`}
              aria-pressed={componentType === lib.component_type}
              title={lib.display_name}
              onClick={() => setParam("type", componentType === lib.component_type ? null : lib.component_type)}
            >
              <span className="plib-rail__sym"><EquipmentSymbol kind={symbolForLibrary(lib)} size={26} /></span>
              <span className="plib-rail__name">{shortName(lib.display_name)}</span>
              <span className="plib-rail__count">{lib.pattern_count}</span>
            </button>
          ))}
        </nav>

        <section className="plib-list pl-panel" aria-label="Patterns">
          <div className="plib-filters">
            <label className="plib-search">
              <Search aria-hidden />
              <span className="eng-sr-only">Search patterns</span>
              <input
                className="pl-input"
                type="search"
                placeholder="Search titles, failure modes, roles…"
                value={query}
                onChange={(e) => setParam("q", e.target.value || null)}
              />
              {query ? <IconButton size="sm" label="Clear search" icon={<X />} onClick={() => setParam("q", null)} /> : null}
            </label>
            <div className="plib-filters__row">
              <label className="plib-filter">
                <span className="eng-sr-only">Category</span>
                <select className="pl-select" value={category ?? ""} onChange={(e) => setParam("cat", e.target.value || null)}>
                  <option value="">All categories</option>
                  {categories.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}
                </select>
              </label>
              <label className="plib-filter">
                <span className="eng-sr-only">Severity</span>
                <select className="pl-select" value={severity ?? ""} onChange={(e) => setParam("sev", e.target.value || null)}>
                  <option value="">All severities</option>
                  <option value="critical">Critical</option>
                  <option value="warning">Warning</option>
                  <option value="info">Info</option>
                </select>
              </label>
            </div>
            <div className="plib-filters__count" aria-live="polite">{hits.length} pattern{hits.length === 1 ? "" : "s"}</div>
          </div>
          <ul className="plib-hits">
            {hits.map((p) => (
              <li key={p.pattern_id}>
                <Link
                  to={`/eng/library/${encodeURIComponent(p.pattern_id)}${qs}`}
                  className={`plib-hit${p.pattern_id === patternId ? " is-on" : ""}`}
                  aria-current={p.pattern_id === patternId ? "true" : undefined}
                >
                  <span className="plib-hit__top">
                    <PriorityGlyph status={severityStatus(p.severity)} title={severityLabel(p.severity)} size={11} />
                    <span className="plib-hit__title">{p.title}</span>
                  </span>
                  <span className="plib-hit__meta">
                    <span className="pl-mono">{failureModeOf(p.pattern_id)}</span>
                    <span aria-hidden>·</span>
                    <span>{p.category}</span>
                    {!componentType ? <><span aria-hidden>·</span><span>{shortName(p.display_name)}</span></> : null}
                  </span>
                  <span className="plib-hit__roles">needs {p.required_roles.join(", ")}</span>
                </Link>
              </li>
            ))}
          </ul>
          {!libs.isLoading && !hits.length ? <EmptyState title="No pattern matches">Clear a filter or try another word.</EmptyState> : null}
        </section>

        <section className="plib-main" aria-label="Pattern detail">
          {detail.error ? <ErrorNotice error={detail.error} /> : null}
          {detail.data ? (
            <>
              <PatternDetailView
                pattern={detail.data.pattern}
                library={activeLibrary}
                roles={detail.data.roles}
                onApply={() => setApplyOpen(true)}
              />
              {applyOpen ? (
                <ApplyToAssetDialog
                  open={applyOpen}
                  onOpenChange={setApplyOpen}
                  pattern={detail.data.pattern}
                  library={activeLibrary}
                  roles={detail.data.roles}
                  onSubmitted={(changeId, title) =>
                    setToast({
                      id: Date.now(),
                      title: "Draft submitted for review",
                      body: (
                        <>
                          {title}. <Link to={`/eng/approvals/${changeId}`}>Open in Approvals</Link>
                        </>
                      ),
                    })
                  }
                />
              ) : null}
            </>
          ) : patternId && detail.isLoading ? (
            <EmptyState title="Loading pattern…" />
          ) : !patternId ? (
            <div className="plib-intro pl-panel">
              {activeLibrary ? (
                <>
                  <EquipmentSymbol kind={symbolForLibrary(activeLibrary)} size={56} />
                  <h2>{activeLibrary.display_name}</h2>
                  <p>{activeLibrary.description}</p>
                  <p className="eng-muted">
                    Matches plant asset types:{" "}
                    {activeLibrary.asset_type_aliases.length ? <span className="pl-mono">{activeLibrary.asset_type_aliases.join(", ")}</span> : "none yet (no alias)"}
                  </p>
                </>
              ) : (
                <EmptyState icon={<LibraryBig />} title="Pick a pattern">
                  Choose a component type on the left, then a failure pattern to see its symptoms, mechanism and checks.
                </EmptyState>
              )}
            </div>
          ) : null}
        </section>
      </div>
      <Toast toast={toast} onDismiss={dismiss} />
    </div>
  );
}
