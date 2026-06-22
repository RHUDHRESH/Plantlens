import { createFieldPatch } from "./bundlePatch";
import { FormField } from "./FormField";
import type { StudioDraftIssue, StudioDraftPatch } from "./studioDraftTypes";

interface ActionEnvelopeFormProps {
  action: Record<string, unknown>;
  assetOptions: Array<{ id: string; label: string }>;
  issues: StudioDraftIssue[];
  onPatch: (patch: StudioDraftPatch) => void;
}

function readString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === "string" ? v : "";
}

export function ActionEnvelopeForm({ action, assetOptions, issues, onPatch }: ActionEnvelopeFormProps) {
  const actionId = readString(action, "id");
  const targetIssue = issues.find((i) => i.targetId === actionId && i.code === "UNKNOWN_ACTION_TARGET");

  function patchField(field: string, value: unknown, reason: string) {
    onPatch(
      createFieldPatch("action_envelope", {
        arrayKey: "actions",
        idKey: "id",
        targetId: actionId,
        field,
        value,
        reason,
      }),
    );
  }

  return (
    <form className="studio-form-shell__form" onSubmit={(e) => e.preventDefault()}>
      <FormField label="Action ID" hint="ID rename requires cross-reference migration.">
        <input value={actionId} readOnly disabled aria-readonly />
      </FormField>
      <FormField label="Label">
        <input
          value={readString(action, "label")}
          onChange={(e) => patchField("label", e.target.value, "Update action label")}
        />
      </FormField>
      {"target_asset_id" in action ? (
        <FormField label="Target asset" {...(targetIssue?.message ? { error: targetIssue.message } : {})}>
          <select
            value={readString(action, "target_asset_id")}
            onChange={(e) => patchField("target_asset_id", e.target.value, "Update target asset")}
          >
            <option value="">— none —</option>
            {assetOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} ({a.id})
              </option>
            ))}
          </select>
        </FormField>
      ) : null}
      {"allowed_roles" in action && Array.isArray(action.allowed_roles) ? (
        <FormField label="Allowed roles" hint="Comma-separated role names.">
          <input
            value={(action.allowed_roles as string[]).join(", ")}
            onChange={(e) =>
              patchField(
                "allowed_roles",
                e.target.value.split(",").map((r) => r.trim()).filter(Boolean),
                "Update allowed roles",
              )
            }
          />
        </FormField>
      ) : null}
      {"risk_level" in action ? (
        <FormField label="Risk level">
          <select
            value={readString(action, "risk_level")}
            onChange={(e) => patchField("risk_level", e.target.value, "Update risk level")}
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </FormField>
      ) : null}
      {"blocked_if" in action && Array.isArray(action.blocked_if) ? (
        <FormField label="Blocked if" hint="Advisory gating only — no hardware write in Studio.">
          <input value={(action.blocked_if as string[]).join(", ")} readOnly disabled />
        </FormField>
      ) : null}
      {"requires_isolation" in action ? (
        <FormField label="Requires isolation">
          <input type="checkbox" checked={Boolean(action.requires_isolation)} readOnly disabled />
        </FormField>
      ) : null}
      {"safety_note" in action ? (
        <FormField label="Safety note">
          <textarea value={readString(action, "safety_note")} readOnly disabled rows={2} />
        </FormField>
      ) : null}
    </form>
  );
}