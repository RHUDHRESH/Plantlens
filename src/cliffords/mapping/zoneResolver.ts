import type {
  RegistryResolution,
  ZoneDefinition,
  ZoneRegistry
} from "../contracts/plantModel.js";

function normalize(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "_");
}

function entries(registry: ZoneRegistry): ZoneDefinition[] {
  return Object.entries(registry).map(([key, definition]) => ({
    ...definition,
    id: definition.id || key
  }));
}

export function resolveZone(
  zoneId: string,
  registry: ZoneRegistry
): RegistryResolution {
  const target = normalize(zoneId);
  for (const definition of entries(registry)) {
    if (
      [definition.id, ...(definition.aliases ?? [])]
        .map(normalize)
        .includes(target)
    ) {
      return { status: "RESOLVED", id: definition.id, confidence: 1 };
    }
  }
  return { status: "NEEDS_MAPPING", id: null, confidence: 0 };
}
