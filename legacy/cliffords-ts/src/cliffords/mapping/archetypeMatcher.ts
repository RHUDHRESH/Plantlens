import type {
  ArchetypeDefinition,
  ArchetypeLibrary
} from "../contracts/plantModel.js";

export type ArchetypeMatch = {
  archetype: ArchetypeDefinition | null;
  confidence: number;
};

export function matchArchetype(
  signalTypes: string[],
  library: ArchetypeLibrary
): ArchetypeMatch {
  let best: ArchetypeMatch = { archetype: null, confidence: 0 };
  for (const archetype of Object.values(library)) {
    const expected = archetype.signal_types ?? [];
    if (expected.length === 0) {
      continue;
    }
    const matches = expected.filter((signal) =>
      signalTypes.includes(signal)
    ).length;
    const confidence = matches / expected.length;
    if (confidence > best.confidence) {
      best = { archetype, confidence };
    }
  }
  return best;
}
