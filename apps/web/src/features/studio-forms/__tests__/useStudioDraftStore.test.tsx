import { beforeEach, describe, expect, it } from "vitest";
import { createFieldPatch } from "../bundlePatch";
import { resetStudioDraftStoreForTests, useStudioDraftStore } from "../useStudioDraftStore";

describe("useStudioDraftStore", () => {
  beforeEach(() => {
    resetStudioDraftStoreForTests();
  });

  it("loadInitialBundle sets clean state", () => {
    useStudioDraftStore.getState().loadInitialBundle();
    const state = useStudioDraftStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.status).toBe("clean");
    expect(state.issues.length).toBeGreaterThan(0);
    expect(state.lastValidatedAt).toBeTruthy();
  });

  it("applyPatch marks dirty family", () => {
    useStudioDraftStore.getState().loadInitialBundle();
    const before = useStudioDraftStore.getState().bundle;
    useStudioDraftStore.getState().applyPatch(
      createFieldPatch("plant", {
        arrayKey: "assets",
        idKey: "id",
        targetId: "PV-101",
        field: "display_name",
        value: "Edited PV",
        reason: "test",
      }),
    );
    const after = useStudioDraftStore.getState();
    expect(after.dirtyFamilies.plant).toBe(true);
    expect(after.status).toBe("dirty");
    expect(after.bundle).not.toBe(before);
  });

  it("validateDraft marks invalid on errors", () => {
    useStudioDraftStore.getState().loadInitialBundle();
    useStudioDraftStore.getState().applyPatch({
      family: "tag_map",
      targetId: "PV_101_V",
      reason: "break ref",
      apply: (bundle) => {
        const next = JSON.parse(JSON.stringify(bundle)) as typeof bundle;
        const tagMap = next.tag_map as Record<string, unknown>;
        tagMap.tags = (tagMap.tags as Array<Record<string, unknown>>).map((t) =>
          t.tag === "PV_101_V" ? { ...t, asset_id: "MISSING" } : t,
        );
        return next;
      },
    });
    useStudioDraftStore.getState().validateDraft();
    expect(useStudioDraftStore.getState().status).toBe("invalid");
  });

  it("resetDraft returns clean", () => {
    useStudioDraftStore.getState().loadInitialBundle();
    useStudioDraftStore.getState().applyPatch(
      createFieldPatch("plant", {
        arrayKey: "assets",
        idKey: "id",
        targetId: "PV-101",
        field: "display_name",
        value: "Edited",
        reason: "test",
      }),
    );
    useStudioDraftStore.getState().resetDraft();
    const state = useStudioDraftStore.getState();
    expect(state.status).toBe("clean");
    expect(state.dirtyFamilies.plant).toBe(false);
  });

  it("does not mutate previous bundle object", () => {
    useStudioDraftStore.getState().loadInitialBundle();
    const prev = useStudioDraftStore.getState().bundle;
    useStudioDraftStore.getState().applyPatch(
      createFieldPatch("plant", {
        arrayKey: "assets",
        idKey: "id",
        targetId: "PV-101",
        field: "display_name",
        value: "New name",
        reason: "test",
      }),
    );
    const next = useStudioDraftStore.getState().bundle;
    expect(next).not.toBe(prev);
  });
});