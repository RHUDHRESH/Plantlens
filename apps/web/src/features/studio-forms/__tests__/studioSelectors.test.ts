import { describe, expect, it } from "vitest";
import { getInitialStudioDraftBundle } from "../demoBundleLoader";
import {
  selectAssetOptions,
  selectAssets,
  selectIssuesForTarget,
  selectTagOptions,
  selectTags,
} from "../studioSelectors";
import type { StudioDraftBundle } from "../studioDraftTypes";

describe("studioSelectors", () => {
  const bundle = getInitialStudioDraftBundle();

  it("selects assets safely", () => {
    const assets = selectAssets(bundle);
    expect(assets.length).toBeGreaterThan(0);
    expect(assets[0]!.id).toBeTruthy();
  });

  it("selects tags safely", () => {
    const tags = selectTags(bundle);
    expect(tags.length).toBeGreaterThan(0);
    expect(tags[0]!.tag).toBeTruthy();
  });

  it("selects issues for target", () => {
    const issues = [
      {
        id: "tag_map:PV_101_V:UNKNOWN_ASSET_REF",
        family: "tag_map" as const,
        targetId: "PV_101_V",
        severity: "error" as const,
        code: "UNKNOWN_ASSET_REF",
        message: "bad ref",
      },
    ];
    const scoped = selectIssuesForTarget({ issues }, "tag_map", "PV_101_V");
    expect(scoped).toHaveLength(1);
  });

  it("builds asset and tag options", () => {
    expect(selectAssetOptions(bundle).some((o) => o.id === "PV-101")).toBe(true);
    expect(selectTagOptions(bundle).some((o) => o.id === "PV_101_V")).toBe(true);
  });

  it("tolerates malformed unknown shapes", () => {
    const malformed: StudioDraftBundle = {
      plant: { assets: [null, "bad", { id: 123 }] },
      tag_map: null,
      alarm_rules: undefined,
      causal_graph: [],
      action_envelope: {},
    };
    expect(selectAssets(malformed)).toHaveLength(0);
    expect(selectTags(malformed)).toHaveLength(0);
    expect(selectAssetOptions(malformed)).toEqual([]);
  });
});