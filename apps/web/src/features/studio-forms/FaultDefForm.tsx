import { createFieldPatch } from "./bundlePatch";
import { FormField } from "./FormField";
import type { StudioDraftIssue, StudioDraftPatch } from "./studioDraftTypes";

interface FaultDefFormProps {
  fault: Record<string, unknown>;
  assetOptions: Array<{ id: string; label: string }>;
  issues: StudioDraftIssue[];
  onPatch: (patch: StudioDraftPatch) => void;
}

function readString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === "string" ? v : "";
}

function readSymptoms(obj: Record<string, unknown>): Array<Record<string, unknown>> {
  const raw = obj.symptoms;
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is Record<string, unknown> => !!s && typeof s === "object" && !Array.isArray(s));
}

/** Form-first editor for a single fault_matrix entry (id, name, asset, symptom summary). */
export function FaultDefForm({ fault, assetOptions, issues, onPatch }: FaultDefFormProps) {
  const faultId = readString(fault, "id");
  const symptoms = readSymptoms(fault);
  const nameIssue = issues.find((i) => i.targetId === faultId && i.code === "MISSING_FAULT_NAME");
  const assetIssue = issues.find((i) => i.targetId === faultId && i.code === "UNKNOWN_FAULT_ASSET");

  function patchField(field: string, value: unknown, reason: string) {
    onPatch(
      createFieldPatch("fault_matrix", {
        arrayKey: "faults",
        idKey: "id",
        targetId: faultId,
        field,
        value,
        reason,
      }),
    );
  }

  const symptomSummary =
    symptoms.length === 0
      ? "No symptoms authored yet."
      : symptoms
          .map((s) => {
            const tag = typeof s.tag_id === "string" ? s.tag_id : "?";
            const dir = typeof s.expected_direction === "string" ? s.expected_direction : "?";
            const required = s.required === true ? "required" : "optional";
            return `${tag} ${dir} (${required})`;
          })
          .join("\n");

  return (
    <form className="studio-form-shell__form" onSubmit={(e) => e.preventDefault()} aria-label="Fault definition">
      <FormField label="Fault ID" hint="ID rename requires cross-reference migration.">
        <input value={faultId} readOnly disabled aria-readonly />
      </FormField>
      <FormField label="Name" {...(nameIssue?.message ? { error: nameIssue.message } : {})}>
        <input
          value={readString(fault, "name")}
          onChange={(e) => patchField("name", e.target.value, "Update fault name")}
        />
      </FormField>
      <FormField label="Asset" {...(assetIssue?.message ? { error: assetIssue.message } : {})}>
        <select
          value={readString(fault, "asset_id")}
          onChange={(e) => patchField("asset_id", e.target.value, "Update fault asset")}
        >
          <option value="">— select asset —</option>
          {assetOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </FormField>
      {"description" in fault ? (
        <FormField label="Description">
          <textarea
            value={readString(fault, "description")}
            onChange={(e) => patchField("description", e.target.value, "Update fault description")}
            rows={3}
          />
        </FormField>
      ) : null}
      <FormField
        label="Symptoms"
        hint="Symptom rows are authored as a list; edit individual tags in a later prompt. Summary is read-only here."
      >
        <textarea value={symptomSummary} readOnly disabled aria-readonly rows={Math.min(8, Math.max(3, symptoms.length + 1))} />
      </FormField>
    </form>
  );
}
