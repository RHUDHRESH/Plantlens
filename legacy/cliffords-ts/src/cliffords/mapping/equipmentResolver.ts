import type {
  EquipmentDefinition,
  EquipmentRegistry,
  RegistryResolution
} from "../contracts/plantModel.js";
import { normalizeEquipmentId } from "../normalizers/normalizeEquipmentId.js";
import { normalizedSimilarity } from "./similarity.js";

function entries(registry: EquipmentRegistry): EquipmentDefinition[] {
  return Object.entries(registry).map(([key, definition]) => ({
    ...definition,
    id: definition.id || key
  }));
}

export function resolveEquipment(
  equipmentId: string,
  registry: EquipmentRegistry,
  confidenceThreshold = 0.9
): RegistryResolution {
  const normalized = normalizeEquipmentId(equipmentId);
  if (!normalized) {
    return { status: "UNKNOWN", id: null, confidence: 0 };
  }
  for (const definition of entries(registry)) {
    const candidates = [definition.id, ...(definition.aliases ?? [])]
      .map(normalizeEquipmentId)
      .filter((value): value is string => value !== null);
    if (candidates.includes(normalized)) {
      return { status: "RESOLVED", id: definition.id, confidence: 1 };
    }
  }
  const best = suggestEquipmentMatches(normalized, registry)[0];
  return best && best.confidence >= confidenceThreshold
    ? {
        status: "INFERRED_HIGH_CONFIDENCE",
        id: best.id,
        confidence: best.confidence
      }
    : {
        status: "NEEDS_MAPPING",
        id: null,
        confidence: best?.confidence ?? 0
      };
}

export function suggestEquipmentMatches(
  equipmentId: string,
  registry: EquipmentRegistry
): Array<{ id: string; label: string; confidence: number }> {
  const normalized = normalizeEquipmentId(equipmentId) ?? equipmentId;
  return entries(registry)
    .map((definition) => {
      const candidates = [definition.id, ...(definition.aliases ?? [])]
        .map((value) => normalizeEquipmentId(value) ?? value)
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

export function inferEquipmentFromTag(tagId: string): RegistryResolution {
  const match = /^([A-Z]+)(\d+)/.exec(tagId);
  if (!match) {
    return { status: "UNKNOWN", id: null, confidence: 0 };
  }
  return {
    status: "INFERRED_LOW_CONFIDENCE",
    id: `${match[1]}-${match[2]}`,
    confidence: 0.65
  };
}

export function getEquipmentDefinition(
  id: string,
  registry: EquipmentRegistry
): EquipmentDefinition | null {
  return (
    entries(registry).find(
      (definition) =>
        normalizeEquipmentId(definition.id) === normalizeEquipmentId(id)
    ) ?? null
  );
}
