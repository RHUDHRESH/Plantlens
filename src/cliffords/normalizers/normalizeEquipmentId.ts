import { normalizeText } from "./normalizeText.js";

export function normalizeEquipmentId(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }
  const normalized = text
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/\./g, "-")
    .replace(/[^A-Z0-9_-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized.length > 0 ? normalized : null;
}
