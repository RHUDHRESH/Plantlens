import { createFieldPatch } from "./bundlePatch";
import { FormField } from "./FormField";
import type { StudioDraftIssue, StudioDraftPatch } from "./studioDraftTypes";

interface TagFormProps {
  tag: Record<string, unknown>;
  assetOptions: Array<{ id: string; label: string }>;
  issues: StudioDraftIssue[];
  onPatch: (patch: StudioDraftPatch) => void;
}

function readString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === "string" ? v : "";
}

export function TagForm({ tag, assetOptions, issues, onPatch }: TagFormProps) {
  const tagId = readString(tag, "tag");
  const assetRefIssue = issues.find((i) => i.targetId === tagId && i.code === "UNKNOWN_ASSET_REF");

  function patchField(field: string, value: unknown, reason: string) {
    onPatch(
      createFieldPatch("tag_map", {
        arrayKey: "tags",
        idKey: "tag",
        targetId: tagId,
        field,
        value,
        reason,
      }),
    );
  }

  return (
    <form className="studio-form-shell__form" onSubmit={(e) => e.preventDefault()}>
      <FormField label="Tag ID" hint="Tag ID rename requires cross-reference migration.">
        <input value={tagId} readOnly disabled aria-readonly />
      </FormField>
      <FormField label="Asset" {...(assetRefIssue?.message ? { error: assetRefIssue.message } : {})}>
        <select
          value={readString(tag, "asset_id")}
          onChange={(e) => patchField("asset_id", e.target.value, "Update tag asset reference")}
        >
          <option value="">— select asset —</option>
          {assetOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label} ({a.id})
            </option>
          ))}
        </select>
      </FormField>
      {"signal_type" in tag ? (
        <FormField label="Signal / semantic name">
          <input
            value={readString(tag, "signal_type")}
            onChange={(e) => patchField("signal_type", e.target.value, "Update signal type")}
          />
        </FormField>
      ) : null}
      {"unit" in tag ? (
        <FormField label="Unit">
          <input
            value={readString(tag, "unit")}
            onChange={(e) => patchField("unit", e.target.value, "Update unit")}
          />
        </FormField>
      ) : null}
      {"source_id" in tag ? (
        <FormField label="Source ID">
          <input
            value={readString(tag, "source_id")}
            onChange={(e) => patchField("source_id", e.target.value, "Update source")}
          />
        </FormField>
      ) : null}
      {"register" in tag ? (
        <FormField label="Register address" hint="Register mapping is read-only in this draft shell.">
          <input
            value={String((tag.register as Record<string, unknown> | undefined)?.address ?? "")}
            readOnly
            disabled
          />
        </FormField>
      ) : null}
      {"quality_policy" in tag ? (
        <FormField label="Stale after (ms)">
          <input
            type="number"
            value={String((tag.quality_policy as Record<string, unknown> | undefined)?.stale_after_ms ?? "")}
            onChange={(e) =>
              onPatch({
                family: "tag_map",
                targetId: tagId,
                reason: "Update quality policy",
                apply: (bundle) => {
                  const next = JSON.parse(JSON.stringify(bundle)) as typeof bundle;
                  const tagMap = next.tag_map as Record<string, unknown>;
                  const tags = (tagMap.tags as Array<Record<string, unknown>>).map((t) =>
                    t.tag === tagId
                      ? {
                          ...t,
                          quality_policy: {
                            ...((t.quality_policy as Record<string, unknown>) ?? {}),
                            stale_after_ms: Number(e.target.value),
                          },
                        }
                      : t,
                  );
                  return { ...next, tag_map: { ...tagMap, tags } };
                },
              })
            }
          />
        </FormField>
      ) : null}
    </form>
  );
}