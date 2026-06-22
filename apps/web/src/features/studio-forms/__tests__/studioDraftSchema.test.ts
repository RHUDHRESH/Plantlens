import { describe, expect, it } from "vitest";
import { getInitialStudioDraftBundle } from "../demoBundleLoader";
import { validateCrossReferences, validateStudioDraftBundle } from "../studioDraftSchema";
import type { StudioDraftBundle } from "../studioDraftTypes";

function clone(bundle: StudioDraftBundle): StudioDraftBundle {
  return JSON.parse(JSON.stringify(bundle)) as StudioDraftBundle;
}

describe("studioDraftSchema", () => {
  it("duplicate assets produce deterministic error", () => {
    const bundle = clone(getInitialStudioDraftBundle());
    const plant = bundle.plant as Record<string, unknown>;
    const assets = [...(plant.assets as unknown[])];
    assets.push({ ...(assets[0] as object) });
    plant.assets = assets;

    const issues = validateStudioDraftBundle(bundle);
    const dupes = issues.filter((i) => i.code === "DUPLICATE_ASSET_ID");
    expect(dupes.length).toBeGreaterThan(0);
    expect(dupes[0]!.id).toMatch(/^plant:PV-101:DUPLICATE_ASSET_ID$/);
  });

  it("tag referencing missing asset produces error", () => {
    const bundle = clone(getInitialStudioDraftBundle());
    const tagMap = bundle.tag_map as Record<string, unknown>;
    const tags = (tagMap.tags as Array<Record<string, unknown>>).map((t) =>
      t.tag === "PV_101_V" ? { ...t, asset_id: "MISSING-ASSET" } : t,
    );
    tagMap.tags = tags;

    const issues = validateStudioDraftBundle(bundle);
    expect(issues.some((i) => i.code === "UNKNOWN_ASSET_REF" && i.targetId === "PV_101_V")).toBe(true);
  });

  it("alarm rule referencing missing tag produces error", () => {
    const bundle = clone(getInitialStudioDraftBundle());
    const alarmRules = bundle.alarm_rules as Record<string, unknown>;
    const rules = (alarmRules.rules as Array<Record<string, unknown>>).map((r) =>
      r.id === "MOTOR_CURRENT_HIGH" ? { ...r, tag: "NO_SUCH_TAG" } : r,
    );
    alarmRules.rules = rules;

    const issues = validateStudioDraftBundle(bundle);
    expect(
      issues.some((i) => i.code === "UNKNOWN_TAG_REF" && i.targetId === "MOTOR_CURRENT_HIGH"),
    ).toBe(true);
  });

  it("causal edge referencing missing node produces error", () => {
    const bundle = clone(getInitialStudioDraftBundle());
    const graph = bundle.causal_graph as Record<string, unknown>;
    const edges = (graph.edges as Array<Record<string, unknown>>).map((e) =>
      e.id === "E1" ? { ...e, from: "GHOST-NODE" } : e,
    );
    graph.edges = edges;

    const issues = validateStudioDraftBundle(bundle);
    expect(issues.some((i) => i.code === "UNKNOWN_NODE_REF" && i.targetId === "E1")).toBe(true);
  });

  it("emits info scope warning for partial validation", () => {
    const issues = validateStudioDraftBundle(getInitialStudioDraftBundle());
    expect(issues.some((i) => i.code === "DRAFT_VALIDATION_SCOPE")).toBe(true);
  });

  it("issue ordering is deterministic", () => {
    const bundle = clone(getInitialStudioDraftBundle());
    const tagMap = bundle.tag_map as Record<string, unknown>;
    const tags = (tagMap.tags as Array<Record<string, unknown>>).map((t) =>
      t.tag === "PV_101_V" ? { ...t, asset_id: "MISSING" } : t,
    );
    tagMap.tags = tags;

    const first = validateStudioDraftBundle(bundle);
    const second = validateStudioDraftBundle(bundle);
    expect(first.map((i) => i.id)).toEqual(second.map((i) => i.id));
  });

  it("does not mutate input bundle", () => {
    const bundle = clone(getInitialStudioDraftBundle());
    const before = JSON.stringify(bundle);
    validateStudioDraftBundle(bundle);
    expect(JSON.stringify(bundle)).toBe(before);
  });

  it("validateCrossReferences filters cross-ref codes only", () => {
    const bundle = clone(getInitialStudioDraftBundle());
    const tagMap = bundle.tag_map as Record<string, unknown>;
    tagMap.tags = (tagMap.tags as unknown[]).slice(0, 1);
    const cross = validateCrossReferences(bundle);
    expect(cross.every((i) =>
      ["UNKNOWN_ASSET_REF", "UNKNOWN_TAG_REF", "UNKNOWN_NODE_REF", "UNKNOWN_ACTION_TARGET", "DUPLICATE_ASSET_ID", "DUPLICATE_TAG_ID"].includes(
        i.code,
      ),
    )).toBe(true);
    expect(cross.some((i) => i.code === "DRAFT_VALIDATION_SCOPE")).toBe(false);
  });
});