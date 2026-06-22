import type { StudioDraftBundle, StudioDraftFamily, StudioDraftPatch } from "./studioDraftTypes";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function cloneBundle(bundle: StudioDraftBundle): StudioDraftBundle {
  return JSON.parse(JSON.stringify(bundle)) as StudioDraftBundle;
}

function updateArrayItem(
  bundle: StudioDraftBundle,
  family: StudioDraftFamily,
  arrayKey: string,
  idKey: string,
  targetId: string,
  updater: (item: Record<string, unknown>) => Record<string, unknown>,
): StudioDraftBundle {
  const next = cloneBundle(bundle);
  const root = asRecord(next[family]);
  if (!root) return bundle;
  const items = asArray(root[arrayKey]).map((raw) => {
    const item = asRecord(raw);
    if (!item) return raw;
    const id = typeof item[idKey] === "string" ? item[idKey] : "";
    return id === targetId ? updater({ ...item }) : item;
  });
  return { ...next, [family]: { ...root, [arrayKey]: items } };
}

export function createFieldPatch(
  family: StudioDraftFamily,
  config: {
    arrayKey: string;
    idKey: string;
    targetId: string;
    field: string;
    value: unknown;
    reason: string;
  },
): StudioDraftPatch {
  const { arrayKey, idKey, targetId, field, value, reason } = config;
  return {
    family,
    targetId,
    reason,
    apply: (bundle) =>
      updateArrayItem(bundle, family, arrayKey, idKey, targetId, (item) => ({
        ...item,
        [field]: value,
      })),
  };
}

export function createNestedFieldPatch(
  family: StudioDraftFamily,
  config: {
    arrayKey: string;
    idKey: string;
    targetId: string;
    nestedKey: string;
    field: string;
    value: unknown;
    reason: string;
  },
): StudioDraftPatch {
  const { arrayKey, idKey, targetId, nestedKey, field, value, reason } = config;
  return {
    family,
    targetId,
    reason,
    apply: (bundle) =>
      updateArrayItem(bundle, family, arrayKey, idKey, targetId, (item) => {
        const nested = asRecord(item[nestedKey]) ?? {};
        return { ...item, [nestedKey]: { ...nested, [field]: value } };
      }),
  };
}