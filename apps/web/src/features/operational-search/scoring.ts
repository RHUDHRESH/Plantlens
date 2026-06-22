import type { UserRole } from "../operational-map";
import { expandAliases } from "./thesaurus";
import { normalizeText, tokenize, uniqueTokens } from "./tokenizer";
import type {
  OperationalSearchDocument,
  OperationalSearchIndex,
  OperationalSearchKind,
  OperationalSearchResult,
} from "./searchTypes";

const KIND_PRIORITY: Record<OperationalSearchKind, number> = {
  causal_step: 0,
  alarm: 1,
  asset: 2,
  tag: 3,
  command: 4,
};

const BLANK_QUERY_LIMIT = 12;

export interface ScoreOperationalSearchOptions {
  limit?: number;
  role?: UserRole;
}

function compareResults(a: OperationalSearchResult, b: OperationalSearchResult): number {
  if (b.score !== a.score) return b.score - a.score;
  const kindA = KIND_PRIORITY[a.document.kind];
  const kindB = KIND_PRIORITY[b.document.kind];
  if (kindA !== kindB) return kindA - kindB;
  const titleCmp = a.document.title.localeCompare(b.document.title);
  if (titleCmp !== 0) return titleCmp;
  return a.document.id.localeCompare(b.document.id);
}

function scoreDocumentAgainstQuery(
  doc: OperationalSearchDocument,
  queryTokens: string[],
  role?: UserRole,
): OperationalSearchResult | null {
  if (role === "manager" && doc.kind === "tag") return null;

  const titleNorm = normalizeText(doc.title);
  const subtitleNorm = normalizeText(doc.subtitle);
  const idNorm = normalizeText(doc.id);
  const allDocTokens = uniqueTokens([...doc.tokens, ...doc.aliases]);

  let score = doc.boost;
  const matched = new Set<string>();
  let reason = "boost";

  for (const qt of queryTokens) {
    const titleExact = titleNorm === qt;
    const idExact = idNorm.includes(qt) || normalizeText(doc.assetId ?? "") === qt;
    const titlePrefix = titleNorm.startsWith(qt) || normalizeText(doc.assetId ?? "").startsWith(qt);
    const tokenHit = allDocTokens.includes(qt);
    const subtitleHit = subtitleNorm.includes(qt);

    if (titleExact || idExact) {
      score += 100;
      matched.add(qt);
      reason = "exact match";
    } else if (titlePrefix) {
      score += 60;
      matched.add(qt);
      reason = "prefix match";
    } else if (tokenHit) {
      score += 40;
      matched.add(qt);
      reason = "token match";
    } else if (subtitleHit) {
      score += 20;
      matched.add(qt);
      reason = "subtitle match";
    }
  }

  if (queryTokens.length > 0 && matched.size === 0) return null;

  return {
    document: doc,
    score,
    matchedTokens: [...matched].sort(),
    reason,
  };
}

function blankQueryResults(index: OperationalSearchIndex, role?: UserRole): OperationalSearchResult[] {
  const causal = index.documents
    .filter((d) => d.kind === "causal_step")
    .sort((a, b) => b.boost - a.boost)
    .slice(0, 1)
    .map((d) => ({
      document: d,
      score: d.boost + 200,
      matchedTokens: [] as string[],
      reason: "root causal step",
    }));

  const alarms = index.documents
    .filter((d) => d.kind === "alarm" && d.severity === "critical")
    .sort((a, b) => b.boost - a.boost || a.title.localeCompare(b.title))
    .slice(0, 3)
    .map((d) => ({
      document: d,
      score: d.boost + 150,
      matchedTokens: [] as string[],
      reason: "critical alarm",
    }));

  const assets = index.documents
    .filter((d) => d.kind === "asset" && d.status === "critical")
    .sort((a, b) => b.boost - a.boost || a.title.localeCompare(b.title))
    .slice(0, 3)
    .map((d) => ({
      document: d,
      score: d.boost + 120,
      matchedTokens: [] as string[],
      reason: "critical asset",
    }));

  const commands = index.documents
    .filter((d) => d.kind === "command" && d.boost > 0)
    .sort((a, b) => b.boost - a.boost || a.title.localeCompare(b.title))
    .slice(0, 4)
    .map((d) => ({
      document: d,
      score: d.boost + 50,
      matchedTokens: [] as string[],
      reason: "command",
    }));

  const tags =
    role === "manager"
      ? []
      : index.documents
          .filter((d) => d.kind === "tag" && d.status !== "GOOD")
          .sort((a, b) => b.boost - a.boost)
          .slice(0, 2)
          .map((d) => ({
            document: d,
            score: d.boost + 30,
            matchedTokens: [] as string[],
            reason: "bad quality tag",
          }));

  const combined = [...causal, ...alarms, ...assets, ...commands, ...tags];
  combined.sort(compareResults);
  return combined.slice(0, BLANK_QUERY_LIMIT);
}

export function scoreOperationalSearch(
  index: OperationalSearchIndex,
  query: string,
  options?: ScoreOperationalSearchOptions,
): OperationalSearchResult[] {
  const limit = options?.limit ?? 20;
  const normalized = normalizeText(query);

  if (!normalized) {
    return blankQueryResults(index, options?.role).slice(0, limit);
  }

  const queryTokens = expandAliases(uniqueTokens(tokenize(normalized)));
  const results: OperationalSearchResult[] = [];

  for (const doc of index.documents) {
    const scored = scoreDocumentAgainstQuery(doc, queryTokens, options?.role);
    if (scored) results.push(scored);
  }

  results.sort(compareResults);
  return results.slice(0, limit);
}