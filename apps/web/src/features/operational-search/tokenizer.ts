const SEPARATOR_RE = /[\s_\-/.:]+/g;
const PUNCT_TRIM_RE = /[^\w]+/g;

export function normalizeText(input: string): string {
  return input.trim().toLowerCase().replace(PUNCT_TRIM_RE, " ").replace(/\s+/g, " ").trim();
}

function splitIndustrialId(token: string): string[] {
  const parts: string[] = [];
  const lower = token.toLowerCase();
  if (!lower) return parts;

  parts.push(lower);

  const hyphenParts = lower.split("-").filter(Boolean);
  for (const p of hyphenParts) parts.push(p);

  const underscoreParts = lower.split("_").filter(Boolean);
  for (const p of underscoreParts) parts.push(p);

  const compact = lower.replace(/[^a-z0-9]/g, "");
  if (compact && compact !== lower) parts.push(compact);

  return parts;
}

export function tokenize(input: string): string[] {
  const normalized = normalizeText(input);
  if (!normalized) return [];

  const raw = normalized.split(SEPARATOR_RE).filter(Boolean);
  const expanded: string[] = [];

  const fullCompact = normalized.replace(/[^a-z0-9]/g, "");
  if (fullCompact) expanded.push(fullCompact);

  for (const token of raw) {
    expanded.push(...splitIndustrialId(token));
  }

  return expanded;
}

export function uniqueTokens(tokens: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function buildDocumentTokens(...parts: string[]): string[] {
  const all: string[] = [];
  for (const part of parts) {
    all.push(...tokenize(part));
  }
  return uniqueTokens(all);
}