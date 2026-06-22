import { createFieldPatch } from "./bundlePatch";
import { FormField } from "./FormField";
import type { StudioDraftIssue, StudioDraftPatch } from "./studioDraftTypes";

const ASSET_TYPES = [
  "source.solar",
  "control.charge_controller",
  "storage.battery",
  "distribution.dc_bus",
  "drive.inverter",
  "load.lamp",
  "load.motor_3phase",
] as const;

interface AssetFormProps {
  asset: Record<string, unknown>;
  assetTypes?: string[];
  issues: StudioDraftIssue[];
  onPatch: (patch: StudioDraftPatch) => void;
}

function readString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === "string" ? v : "";
}

export function AssetForm({ asset, assetTypes = [], issues, onPatch }: AssetFormProps) {
  const id = readString(asset, "id");
  const typeOptions = [...new Set([...ASSET_TYPES, ...assetTypes, readString(asset, "type")].filter(Boolean))];
  const fieldIssues = issues.filter((i) => i.targetId === id);

  function patchField(field: string, value: unknown, reason: string) {
    onPatch(
      createFieldPatch("plant", {
        arrayKey: "assets",
        idKey: "id",
        targetId: id,
        field,
        value,
        reason,
      }),
    );
  }

  return (
    <form className="studio-form-shell__form" onSubmit={(e) => e.preventDefault()}>
      <FormField
        label="ID"
        hint="ID rename requires cross-reference migration."
      >
        <input value={id} readOnly disabled aria-readonly />
      </FormField>
      <FormField
        label="Display name"
        {...(fieldIssues.find((i) => i.code === "MISSING_DISPLAY_NAME")?.message
          ? { error: fieldIssues.find((i) => i.code === "MISSING_DISPLAY_NAME")!.message }
          : {})}
      >
        <input
          value={readString(asset, "display_name")}
          onChange={(e) => patchField("display_name", e.target.value, "Update display name")}
        />
      </FormField>
      <FormField label="Type">
        <select
          value={readString(asset, "type")}
          onChange={(e) => patchField("type", e.target.value, "Update asset type")}
        >
          {typeOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </FormField>
      {"area_id" in asset ? (
        <FormField label="Area / zone">
          <input
            value={readString(asset, "area_id")}
            onChange={(e) => patchField("area_id", e.target.value, "Update area")}
          />
        </FormField>
      ) : null}
      {"notes" in asset || "description" in asset ? (
        <FormField label="Notes">
          <textarea
            value={readString(asset, "notes") || readString(asset, "description")}
            onChange={(e) => patchField("notes" in asset ? "notes" : "description", e.target.value, "Update notes")}
            rows={3}
          />
        </FormField>
      ) : null}
    </form>
  );
}