import type { StudioDraftBundle, StudioDraftFamily, StudioDraftIssue } from "./studioDraftTypes";

const FAMILY_ORDER: StudioDraftFamily[] = [
  "plant",
  "tag_map",
  "alarm_rules",
  "causal_graph",
  "action_envelope",
];

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;

function issue(
  family: StudioDraftFamily,
  targetId: string | null,
  severity: StudioDraftIssue["severity"],
  code: string,
  message: string,
  fixHint?: string,
): StudioDraftIssue {
  return {
    id: `${family}:${targetId ?? "global"}:${code}`,
    family,
    targetId,
    severity,
    code,
    message,
    ...(fixHint ? { fixHint } : {}),
  };
}

function sortIssues(issues: StudioDraftIssue[]): StudioDraftIssue[] {
  return [...issues].sort((a, b) => {
    const family = FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family);
    if (family !== 0) return family;
    const severity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severity !== 0) return severity;
    const target = (a.targetId ?? "").localeCompare(b.targetId ?? "");
    if (target !== 0) return target;
    return a.code.localeCompare(b.code);
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === "string" ? v : "";
}

/** Draft-shell validation — not a canonical contract replacement. */
export function validateStudioDraftBundle(bundle: StudioDraftBundle): StudioDraftIssue[] {
  const issues: StudioDraftIssue[] = [];
  const plant = asRecord(bundle.plant);
  const tagMap = asRecord(bundle.tag_map);
  const alarmRules = asRecord(bundle.alarm_rules);
  const causalGraph = asRecord(bundle.causal_graph);
  const actionEnvelope = asRecord(bundle.action_envelope);

  if (!plant) {
    issues.push(
      issue("plant", null, "error", "MISSING_PLANT", "Plant contract is missing or invalid.", "Load the demo plant bundle."),
    );
    return sortIssues(issues);
  }

  const assets = asArray(plant.assets);
  const assetIds = new Set<string>();
  for (const raw of assets) {
    const asset = asRecord(raw);
    if (!asset) continue;
    const id = readString(asset, "id").trim();
    if (!id) {
      issues.push(
        issue("plant", null, "error", "MISSING_ASSET_ID", "An asset is missing an id.", "Set a unique asset id."),
      );
      continue;
    }
    if (assetIds.has(id)) {
      issues.push(
        issue("plant", id, "error", "DUPLICATE_ASSET_ID", `Duplicate asset id: ${id}.`, "Use unique asset ids."),
      );
    }
    assetIds.add(id);
    const displayName = readString(asset, "display_name").trim();
    if (!displayName) {
      issues.push(
        issue(
          "plant",
          id,
          "error",
          "MISSING_DISPLAY_NAME",
          `Asset ${id} is missing display_name.`,
          "Add a human-readable display name.",
        ),
      );
    }
  }

  if (!tagMap) {
    issues.push(
      issue("tag_map", null, "warning", "MISSING_TAG_MAP", "Tag map contract not loaded.", "Load tag_map.json in the draft bundle."),
    );
  } else {
    const tagIds = new Set<string>();
    for (const raw of asArray(tagMap.tags)) {
      const tag = asRecord(raw);
      if (!tag) continue;
      const tagId = readString(tag, "tag").trim();
      const assetId = readString(tag, "asset_id").trim();
      if (!tagId) {
        issues.push(issue("tag_map", null, "error", "MISSING_TAG_ID", "A tag entry is missing tag id.", "Set tag id."));
        continue;
      }
      if (tagIds.has(tagId)) {
        issues.push(
          issue("tag_map", tagId, "error", "DUPLICATE_TAG_ID", `Duplicate tag id: ${tagId}.`, "Use unique tag ids."),
        );
      }
      tagIds.add(tagId);
      if (!assetId || !assetIds.has(assetId)) {
        issues.push(
          issue(
            "tag_map",
            tagId,
            "error",
            "UNKNOWN_ASSET_REF",
            `Tag ${tagId} references missing asset ${assetId || "(empty)"}.`,
            "Create the asset or correct asset_id.",
          ),
        );
      }
    }
  }

  if (!alarmRules) {
    issues.push(
      issue(
        "alarm_rules",
        null,
        "warning",
        "MISSING_ALARM_RULES",
        "Alarm rules contract not loaded.",
        "Load alarm_rules.json in the draft bundle.",
      ),
    );
  } else {
    const tagIds = new Set(
      asArray(tagMap?.tags ?? [])
        .map((t) => asRecord(t))
        .filter(Boolean)
        .map((t) => readString(t!, "tag")),
    );
    for (const raw of asArray(alarmRules.rules)) {
      const rule = asRecord(raw);
      if (!rule) continue;
      const ruleId = readString(rule, "id").trim();
      const tagRef = readString(rule, "tag").trim();
      const message = readString(rule, "message").trim();
      if (!ruleId) {
        issues.push(issue("alarm_rules", null, "error", "MISSING_RULE_ID", "Alarm rule missing id.", "Set alarm rule id."));
        continue;
      }
      if (!message) {
        issues.push(
          issue(
            "alarm_rules",
            ruleId,
            "warning",
            "MISSING_RULE_MESSAGE",
            `Alarm ${ruleId} has no message.`,
            "Add operator-facing message text.",
          ),
        );
      }
      if (!tagRef || !tagIds.has(tagRef)) {
        issues.push(
          issue(
            "alarm_rules",
            ruleId,
            "error",
            "UNKNOWN_TAG_REF",
            `Alarm ${ruleId} references unknown tag ${tagRef || "(empty)"}.`,
            "Add the tag or pick an existing tag.",
          ),
        );
      }
    }
  }

  if (!causalGraph) {
    issues.push(
      issue(
        "causal_graph",
        null,
        "warning",
        "MISSING_CAUSAL_GRAPH",
        "Causal graph contract not loaded.",
        "Load causal_graph.json in the draft bundle.",
      ),
    );
  } else {
    const nodeIds = new Set(
      asArray(causalGraph.nodes)
        .map((n) => asRecord(n))
        .filter(Boolean)
        .map((n) => readString(n!, "id")),
    );
    for (const raw of asArray(causalGraph.edges)) {
      const edge = asRecord(raw);
      if (!edge) continue;
      const edgeId = readString(edge, "id").trim();
      const from = readString(edge, "from").trim();
      const to = readString(edge, "to").trim();
      if (!edgeId) continue;
      if (!nodeIds.has(from) || !nodeIds.has(to)) {
        issues.push(
          issue(
            "causal_graph",
            edgeId,
            "error",
            "UNKNOWN_NODE_REF",
            `Edge ${edgeId} references unknown nodes (${from} → ${to}).`,
            "Connect only existing graph nodes.",
          ),
        );
      }
      if (edge.approved === false) {
        issues.push(
          issue(
            "causal_graph",
            edgeId,
            "info",
            "EDGE_NOT_APPROVED",
            `Edge ${edgeId} is not approved — visible in Studio, not runtime traversed.`,
            "Approve edge when ready for runtime DAG.",
          ),
        );
      }
    }
  }

  if (!actionEnvelope) {
    issues.push(
      issue(
        "action_envelope",
        null,
        "warning",
        "MISSING_ACTION_ENVELOPE",
        "Action envelope contract not loaded.",
        "Load action_envelope in the draft bundle.",
      ),
    );
  } else {
    for (const raw of asArray(actionEnvelope.actions)) {
      const action = asRecord(raw);
      if (!action) continue;
      const actionId = readString(action, "id").trim();
      const label = readString(action, "label").trim();
      const targetAsset = readString(action, "target_asset_id").trim();
      if (!actionId) continue;
      if (!label) {
        issues.push(
          issue(
            "action_envelope",
            actionId,
            "warning",
            "MISSING_ACTION_LABEL",
            `Action ${actionId} has no label.`,
            "Add operator-facing label.",
          ),
        );
      }
      if (targetAsset && !assetIds.has(targetAsset)) {
        issues.push(
          issue(
            "action_envelope",
            actionId,
            "error",
            "UNKNOWN_ACTION_TARGET",
            `Action ${actionId} references missing asset ${targetAsset}.`,
            "Pick an existing asset id.",
          ),
        );
      }
    }
  }

  issues.push(
    issue(
      "plant",
      null,
      "info",
      "DRAFT_VALIDATION_SCOPE",
      "Validation is local draft-shell only — canonical JSON Schema checks come after forms are wired.",
      undefined,
    ),
  );

  return sortIssues(issues);
}

export function validateCrossReferences(bundle: StudioDraftBundle): StudioDraftIssue[] {
  return validateStudioDraftBundle(bundle).filter((i) =>
    ["UNKNOWN_ASSET_REF", "UNKNOWN_TAG_REF", "UNKNOWN_NODE_REF", "UNKNOWN_ACTION_TARGET", "DUPLICATE_ASSET_ID", "DUPLICATE_TAG_ID"].includes(
      i.code,
    ),
  );
}

export function validateDraftBundle(bundle: StudioDraftBundle): StudioDraftIssue[] {
  return validateStudioDraftBundle(bundle);
}