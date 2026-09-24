import { useQueries } from "@tanstack/react-query";
import { CheckCircle2, EyeOff } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getCoverage } from "../../api/v2";
import { qk } from "../../api/queries";
import { useSession } from "../../app/session";
import { EquipmentSymbol, symbolForAssetType } from "../../components/symbols";
import { EmptyState, ErrorNotice, PageHeader, Panel, PriorityGlyph, SegmentedControl } from "../../components/ui/primitives";
import { useCompiledIndexes } from "../approvals/engData";
import type { AssetInfo } from "../approvals/engData";
import { ambiguousRolesInRow, coverageMatrix, rampPercent, rankRecommendations, ratio, totals } from "./coverageModel";
import type { AssetCoverage } from "./coverageModel";
import { humanize, severityLabel, severityStatus } from "./libraryModel";
import "../approvals/approvals.css";
import "./pattern-library.css";

function RatioBar({ observable, total, label }: { observable: number; total: number; label: string }) {
  const r = ratio(observable, total);
  return (
    <div
      className={`cov-bar${total === 0 ? " cov-bar--none" : ""}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={observable}
      aria-valuetext={total ? `${observable} of ${total} failure modes observable` : "No pattern library for this asset type"}
    >
      <span className="cov-bar__fill" style={{ width: `${r * 100}%` }} />
    </div>
  );
}

function useAllCoverage(assets: readonly AssetInfo[]) {
  const ready = useSession((s) => s.status === "ready");
  const results = useQueries({
    queries: assets.map((a) => ({
      queryKey: qk.coverage(a.id),
      queryFn: ({ signal }: { signal: AbortSignal }) => getCoverage(a.id, signal),
      enabled: ready,
    })),
  });
  const coverages: AssetCoverage[] = [];
  results.forEach((r) => {
    if (r.data) coverages.push(r.data as AssetCoverage);
  });
  return {
    coverages,
    loading: results.some((r) => r.isLoading),
    error: results.find((r) => r.error)?.error ?? null,
  };
}

function AssetPatterns({ coverage, asset }: { coverage: AssetCoverage | undefined; asset: AssetInfo | undefined }) {
  if (!coverage) return <EmptyState title="Loading coverage…" />;
  if (!coverage.total) {
    return (
      <EmptyState icon={<EyeOff />} title={`No pattern library covers ${asset?.type ?? coverage.asset_type}`}>
        Add an <span className="pl-mono">asset_type_aliases</span> entry to a component library so its failure patterns apply to this asset.
      </EmptyState>
    );
  }
  const rows = [...coverage.patterns].sort((a, b) => Number(a.observable) - Number(b.observable) || a.title.localeCompare(b.title));
  return (
    <table className="pl-table cov-table">
      <thead>
        <tr>
          <th scope="col">Failure pattern</th>
          <th scope="col">Category</th>
          <th scope="col">Observable today</th>
          <th scope="col">Missing roles <span className="cov-th-note">(bold = required)</span></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.pattern_id}>
            <td>
              <Link className="eng-link" to={`/eng/library/${encodeURIComponent(p.pattern_id)}`}>{p.title}</Link>
              <div className="pl-mono cov-pid">
                <PriorityGlyph status={severityStatus(p.severity)} title={severityLabel(p.severity)} size={9} />
                <span>{p.pattern_id}</span>
              </div>
            </td>
            <td>{humanize(p.category)}</td>
            <td>
              {p.observable ? (
                <span className="cov-obs cov-obs--yes"><CheckCircle2 aria-hidden /> Observable</span>
              ) : (
                <span className="cov-obs cov-obs--no"><EyeOff aria-hidden /> Not observable</span>
              )}
            </td>
            <td>
              <div className="cov-missing">
                {p.missing_required.map((r) =>
                  ambiguousRolesInRow(p).includes(r) ? (
                    <Link key={r} className="eng-chip cov-chip-amb" title="Several tags match: choose one when applying the pattern" to={`/eng/library/${encodeURIComponent(p.pattern_id)}`}>
                      {r} · choose tag
                    </Link>
                  ) : (
                    <span key={r} className="eng-chip eng-chip--req" title="Required role — needs a sensor">{r}</span>
                  ),
                )}
                {p.missing_optional.slice(0, 4).map((r) => <span key={r} className="eng-chip eng-chip--opt" title="Optional role">{r}</span>)}
                {p.missing_optional.length > 4 ? <span className="eng-muted">+{p.missing_optional.length - 4}</span> : null}
                {!p.missing_required.length && !p.missing_optional.length ? <span className="eng-muted">—</span> : null}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CoveragePage() {
  const [params, setParams] = useSearchParams();
  const indexes = useCompiledIndexes();
  const assets = useMemo(() => indexes.data?.assets ?? [], [indexes.data]);
  const { coverages, loading, error } = useAllCoverage(assets);
  const [view, setView] = useState<"recommendations" | "matrix">("recommendations");

  const byId = useMemo(() => new Map(coverages.map((c) => [c.asset_id, c])), [coverages]);
  const requested = params.get("asset");
  const selectedId = requested ?? assets.find((a) => (byId.get(a.id)?.total ?? 0) > 0)?.id ?? assets[0]?.id ?? null;
  const selectedAsset = assets.find((a) => a.id === selectedId);
  const selectedCov = selectedId ? byId.get(selectedId) : undefined;
  const recs = useMemo(() => rankRecommendations(coverages), [coverages]);
  const matrix = useMemo(() => coverageMatrix(coverages.filter((c) => c.total > 0)), [coverages]);
  const sum = totals(coverages);
  const maxUnlock = Math.max(1, ...recs.map((r) => r.unlocks + r.contributes));

  return (
    <div className="pl-page">
      <PageHeader
        title="Coverage"
        description="Which failure modes PlantLens can observe with today's instrumentation, per asset, and which sensors would unlock the most."
        meta={
          coverages.length ? (
            <span>
              <strong>{sum.observable}</strong> of <strong>{sum.total}</strong> failure modes observable across {assets.length} assets
            </span>
          ) : null
        }
      />
      {indexes.error ? <ErrorNotice error={indexes.error} /> : null}
      {error ? <ErrorNotice error={error} /> : null}

      <div className="cov-top">
        <Panel title="Assets" padded={false}>
          <ul className="cov-assets">
            {assets.map((a) => {
              const c = byId.get(a.id);
              return (
                <li key={a.id}>
                  <Link
                    to={`/eng/coverage?asset=${encodeURIComponent(a.id)}`}
                    className={`cov-asset${a.id === selectedId ? " is-on" : ""}`}
                    aria-current={a.id === selectedId ? "true" : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      setParams({ asset: a.id }, { replace: true });
                    }}
                  >
                    <EquipmentSymbol kind={symbolForAssetType(a.type)} size={28} />
                    <span className="cov-asset__name">
                      <span className="pl-mono">{a.id}</span>
                      <small>{a.display_name}</small>
                    </span>
                    <span className="cov-asset__ratio">{c ? (c.total ? `${c.observable}/${c.total}` : "no library") : "…"}</span>
                    <RatioBar observable={c?.observable ?? 0} total={c?.total ?? 0} label={`${a.id} observability`} />
                  </Link>
                </li>
              );
            })}
          </ul>
          {indexes.isLoading ? <EmptyState title="Loading assets…" /> : null}
        </Panel>

        <Panel
          title={selectedAsset ? `${selectedAsset.id} · ${selectedAsset.display_name ?? ""} · ${selectedAsset.type ?? ""}` : "Asset"}
          actions={
            selectedCov?.total ? (
              <span className="eng-muted">
                {selectedCov.observable}/{selectedCov.total} observable · bundle r{selectedCov.bundle_rev}
              </span>
            ) : null
          }
          padded={false}
        >
          {selectedCov?.total ? (
            <div className="pl-panel__body cov-summary">
              <span className="cov-summary__big">{Math.round(ratio(selectedCov.observable, selectedCov.total) * 100)}%</span>
              <RatioBar observable={selectedCov.observable} total={selectedCov.total} label="Selected asset observability" />
            </div>
          ) : null}
          <div className="plib-scroll">
            <AssetPatterns coverage={selectedCov} asset={selectedAsset} />
          </div>
        </Panel>
      </div>

      <Panel
        title={view === "recommendations" ? "Instrumentation recommendations" : "Coverage matrix — assets × failure categories"}
        actions={
          <SegmentedControl
            label="Plant-wide view"
            value={view}
            onChange={setView}
            options={[
              { value: "recommendations", label: "Recommendations" },
              { value: "matrix", label: "Matrix" },
            ]}
          />
        }
      >
        {loading && !coverages.length ? <EmptyState title="Computing coverage…" /> : null}
        {view === "recommendations" ? (
          recs.length ? (
            <>
              <p className="eng-muted" style={{ marginTop: 0 }}>
                Missing signal roles ranked by how many failure modes they would make observable. “Unlocks” counts modes where this role is the only
                missing required signal; “helps” counts modes that need it plus another sensor.
              </p>
              <ol className="cov-recs">
                {recs.slice(0, 12).map((r, i) => (
                  <li key={r.role} className="cov-rec">
                    <span className="cov-rec__rank">{i + 1}</span>
                    <span className="cov-rec__role">{r.role}</span>
                    <span className="cov-rec__why">
                      on {r.assets.map((a, j) => (
                        <span key={a}>
                          {j ? ", " : ""}
                          <Link className="eng-link pl-mono" to={`/eng/coverage?asset=${encodeURIComponent(a)}`} onClick={(e) => { e.preventDefault(); setParams({ asset: a }, { replace: true }); }}>{a}</Link>
                        </span>
                      ))}
                      {" — "}
                      {(() => {
                        const titles = [...new Set((r.patterns.some((p) => p.sole) ? r.patterns.filter((p) => p.sole) : r.patterns).map((p) => p.title))];
                        return titles.slice(0, 3).join("; ") + (titles.length > 3 ? " …" : "");
                      })()}
                    </span>
                    <span className="cov-rec__bar">
                      <span className="cov-bar" aria-hidden>
                        <span className="cov-bar__fill" style={{ width: `${((r.unlocks + r.contributes) / maxUnlock) * 100}%`, opacity: 0.35 }} />
                        <span className="cov-bar__fill" style={{ width: `${(r.unlocks / maxUnlock) * 100}%` }} />
                      </span>
                      <strong>{r.unlocks}</strong> unlocks{r.contributes ? <span className="eng-muted"> · helps {r.contributes}</span> : null}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : coverages.length ? (
            <EmptyState title="Every covered failure mode is observable">No missing required roles on any asset.</EmptyState>
          ) : null
        ) : (
          <div className="cov-grid">
            <table aria-label="Observable failure modes by asset and category">
              <thead>
                <tr>
                  <th scope="col">Asset</th>
                  {matrix.categories.map((c) => <th key={c} scope="col">{humanize(c)}</th>)}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <tr key={row.asset_id}>
                    <th scope="row" className="pl-mono">{row.asset_id}</th>
                    {matrix.categories.map((c) => {
                      const cell = row.cells[c]!;
                      const pct = rampPercent(cell.ratio);
                      return (
                        <td
                          key={c}
                          className={`cov-cell${cell.total === 0 ? " cov-cell--empty" : ""}${pct >= 55 ? " cov-cell--hi" : ""}`}
                          style={{ ["--ramp" as string]: `${pct}%` }}
                          title={cell.total ? `${row.asset_id} · ${c}: ${cell.observable} of ${cell.total} observable` : `${row.asset_id} has no ${c} patterns`}
                        >
                          {cell.total ? `${cell.observable}/${cell.total}` : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="cov-ramp">
              <span>0%</span>
              <span className="cov-ramp__bar" aria-hidden />
              <span>100% observable</span>
              <span className="eng-muted">· dashed = no patterns in that category</span>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
