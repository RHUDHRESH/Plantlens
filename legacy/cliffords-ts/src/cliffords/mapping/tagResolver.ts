import type {
  RegistryResolution,
  TagDefinition,
  TagRegistry
} from "../contracts/plantModel.js";
import { normalizeTagId } from "../normalizers/normalizeTagId.js";
import { normalizedSimilarity } from "./similarity.js";

export type SuggestedMatch = {
  id: string;
  label: string;
  confidence: number;
};

function entries(registry: TagRegistry): TagDefinition[] {
  return Object.entries(registry).map(([key, definition]) => ({
    ...definition,
    id: definition.id || key
  }));
}

export function resolveTag(
  tagId: string,
  registry: TagRegistry,
  confidenceThreshold = 0.9
): RegistryResolution {
  const normalized = normalizeTagId(tagId);
  if (!normalized) {
    return { status: "UNKNOWN", id: null, confidence: 0 };
  }
  for (const definition of entries(registry)) {
    const candidates = [definition.id, ...(definition.aliases ?? [])]
      .map(normalizeTagId)
      .filter((value): value is string => value !== null);
    if (candidates.includes(normalized)) {
      return { status: "RESOLVED", id: definition.id, confidence: 1 };
    }
  }
  const best = suggestTagMatches(normalized, registry)[0];
  return best && best.confidence >= confidenceThreshold
    ? {
        status: "INFERRED_HIGH_CONFIDENCE",
        id: best.id,
        confidence: best.confidence
      }
    : { status: "NEEDS_MAPPING", id: null, confidence: best?.confidence ?? 0 };
}

export function suggestTagMatches(
  tagId: string,
  registry: TagRegistry
): SuggestedMatch[] {
  const normalized = normalizeTagId(tagId) ?? tagId;
  return entries(registry)
    .map((definition) => {
      const candidates = [definition.id, ...(definition.aliases ?? [])]
        .map((value) => normalizeTagId(value) ?? value)
        .filter((value) => value.length > 0);
      return {
        id: definition.id,
        label: definition.label ?? definition.id,
        confidence: Math.max(
          ...candidates.map((candidate) =>
            normalizedSimilarity(normalized, candidate)
          )
        )
      };
    })
    .filter((match) => match.confidence >= 0.45)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 5);
}

export function getTagDefinition(
  id: string,
  registry: TagRegistry
): TagDefinition | null {
  return (
    entries(registry).find(
      (definition) => normalizeTagId(definition.id) === normalizeTagId(id)
    ) ?? null
  );
}
