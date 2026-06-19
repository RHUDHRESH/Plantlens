import { normalizeText } from "./normalizeText.js";

export function normalizeTagId(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }
  const normalized = text
    .toUpperCase()
    .replace(/\./g, "_")
    .replace(/([A-Z])-(?=\d)/g, "$1")
    .replace(/(?<=\d)-(?=[A-Z])/g, "_")
    .replace(/[\s-]+/g, "_")
    .replace(/[^A-Z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return normalized.length > 0 ? normalized : null;
}
