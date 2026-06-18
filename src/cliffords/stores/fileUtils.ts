import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

function sortJsonValue(
  value: unknown,
  ancestors: Set<object>
): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (value === undefined) {
    return undefined;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("base64");
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new TypeError("Cannot serialize cyclic data");
    }
    ancestors.add(value);
    const result = value.map((entry) => sortJsonValue(entry, ancestors));
    ancestors.delete(value);
    return result;
  }
  if (typeof value === "object") {
    if (ancestors.has(value)) {
      throw new TypeError("Cannot serialize cyclic data");
    }
    ancestors.add(value);
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const entry = sortJsonValue(
        (value as Record<string, unknown>)[key],
        ancestors
      );
      if (entry !== undefined) {
        result[key] = entry;
      }
    }
    ancestors.delete(value);
    return result;
  }
  return String(value);
}

export async function atomicWrite(
  targetPath: string,
  data: string | Uint8Array
): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporaryPath, data);
    await rename(temporaryPath, targetPath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export function stableJson(value: unknown): string {
  return `${canonicalJson(value, 2)}\n`;
}

export function canonicalJson(
  value: unknown,
  space?: number
): string {
  return JSON.stringify(sortJsonValue(value, new Set()), null, space);
}
