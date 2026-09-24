/** Observability coverage maths: ratios, instrumentation recommendations, asset × category matrix. */
import type { CoverageRow } from "../../api/v2";

export interface AssetCoverage {
  asset_id: string;
  asset_type: string;
  observable: number;
  total: number;
  bundle_rev?: number;
  patterns: CoverageRow[];
}

export function ratio(observable: number, total: number): number {
  return total > 0 ? observable / total : 0;
}

/** Roles the API could not bind because several tags match (a tag-map decision, not a missing sensor). */
export function ambiguousRolesInRow(row: Pick<CoverageRow, "unresolved">): string[] {
  const out: string[] = [];
  for (const u of row.unresolved) {
    const m = /^Role '([^']+)' matches several tags/.exec(u);
    if (m) out.push(m[1]!);
  }
  return out;
}

export interface Recommendation {
  role: string;
  /** Failure modes that become observable if only this role is added (it is the sole missing required role). */
  unlocks: number;
  /** Failure modes where this role is one of several missing required roles. */
  contributes: number;
  assets: string[];
  patterns: { asset_id: string; pattern_id: string; title: string; sole: boolean }[];
}

/**
 * Rank missing required roles by how many unobservable failure modes they would unlock across
 * assets. Ties: more partial contributions, then fewer assets to instrument, then role name.
 */
export function rankRecommendations(coverages: readonly AssetCoverage[]): Recommendation[] {
  const byRole = new Map<string, Recommendation>();
  for (const cov of coverages) {
    for (const row of cov.patterns) {
      if (row.observable || !row.missing_required.length) continue;
      // Ambiguous roles need a binding decision, not a new sensor: never recommend instrumenting them.
      const ambiguous = new Set(ambiguousRolesInRow(row));
      const missing = row.missing_required.filter((r) => !ambiguous.has(r));
      if (!missing.length) continue;
      const sole = missing.length === 1;
      for (const role of missing) {
        let rec = byRole.get(role);
        if (!rec) {
          rec = { role, unlocks: 0, contributes: 0, assets: [], patterns: [] };
          byRole.set(role, rec);
        }
        if (sole) rec.unlocks += 1;
        else rec.contributes += 1;
        if (!rec.assets.includes(cov.asset_id)) rec.assets.push(cov.asset_id);
        rec.patterns.push({ asset_id: cov.asset_id, pattern_id: row.pattern_id, title: row.title, sole });
      }
    }
  }
  return [...byRole.values()]
    .map((r) => ({ ...r, assets: [...r.assets].sort() }))
    .sort(
      (a, b) =>
        b.unlocks - a.unlocks || b.contributes - a.contributes || a.assets.length - b.assets.length || a.role.localeCompare(b.role),
    );
}

export interface MatrixCell {
  observable: number;
  total: number;
  ratio: number | null;
}

export interface CoverageMatrix {
  categories: string[];
  rows: { asset_id: string; cells: Record<string, MatrixCell> }[];
}

export function coverageMatrix(coverages: readonly AssetCoverage[]): CoverageMatrix {
  const categories = [...new Set(coverages.flatMap((c) => c.patterns.map((p) => p.category)))].sort();
  const rows = coverages.map((cov) => {
    const cells: Record<string, MatrixCell> = {};
    for (const cat of categories) {
      const inCat = cov.patterns.filter((p) => p.category === cat);
      const obs = inCat.filter((p) => p.observable).length;
      cells[cat] = { observable: obs, total: inCat.length, ratio: inCat.length ? obs / inCat.length : null };
    }
    return { asset_id: cov.asset_id, cells };
  });
  return { categories, rows };
}

/**
 * Neutral → accent ramp for heat-grid cells (never alarm colours: low coverage is a design gap,
 * not a process alarm). Returns a CSS colour-mix percentage of the accent, 0 when empty.
 */
export function rampPercent(r: number | null): number {
  if (r === null) return 0;
  return Math.round(80 * Math.min(1, Math.max(0, r)));
}

export function totals(coverages: readonly AssetCoverage[]): { observable: number; total: number } {
  return coverages.reduce((acc, c) => ({ observable: acc.observable + c.observable, total: acc.total + c.total }), { observable: 0, total: 0 });
}
