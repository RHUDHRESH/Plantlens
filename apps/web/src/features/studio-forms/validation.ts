import type { AuthoredBundle, ValidationIssue } from "../../app/store/studio";

/** Client-side validation aligned with backend fix hints — not a compiler substitute. */
export function validateBundleLocally(bundle: AuthoredBundle): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const assetIds = new Set(bundle.plant.assets.map((a) => a.id));

  for (const asset of bundle.plant.assets) {
    if (!asset.id?.trim()) {
      issues.push({
        code: "MISSING_ASSET_ID",
        severity: "error",
        message: "Asset is missing an id.",
        fix: "Set a unique asset id (e.g. MTR-301).",
        field: "id",
      });
    }
    if (!asset.display_name?.trim()) {
      issues.push({
        code: "MISSING_DISPLAY_NAME",
        severity: "error",
        message: `Asset ${asset.id} is missing display_name.`,
        fix: "Add a human-readable display name.",
        field: "display_name",
        entity_id: asset.id,
      });
    }
  }

  for (const tag of bundle.tag_map.tags) {
    if (!assetIds.has(tag.asset_id)) {
      issues.push({
        code: "UNKNOWN_ASSET_REF",
        severity: "error",
        message: `Tag ${tag.tag} references missing asset ${tag.asset_id}.`,
        fix: "Create the asset or correct asset_id in the tag form.",
        field: "asset_id",
        entity_id: tag.tag,
      });
    }
  }

  for (const rule of bundle.alarm_rules.rules) {
    const tagEntry = bundle.tag_map.tags.find((t) => t.tag === rule.tag);
    if (!tagEntry) {
      issues.push({
        code: "UNKNOWN_TAG_REF",
        severity: "error",
        message: `Alarm ${rule.id} references unknown tag ${rule.tag}.`,
        fix: "Add the tag in the Tags step or pick an existing tag.",
        field: "tag",
        entity_id: rule.id,
      });
    }
  }

  const nodeIds = new Set(bundle.causal_graph.nodes.map((n) => n.id));
  for (const edge of bundle.causal_graph.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      issues.push({
        code: "UNKNOWN_NODE_REF",
        severity: "error",
        message: `Edge ${edge.id} references unknown nodes.`,
        fix: "Connect only existing asset nodes.",
        field: "from",
        entity_id: edge.id,
      });
    }
    if (edge.from === edge.to) {
      issues.push({
        code: "SELF_LOOP",
        severity: "error",
        message: `Edge ${edge.id} is a self-loop.`,
        fix: "Remove self-referencing causal edges.",
        entity_id: edge.id,
      });
    }
  }

  return issues;
}