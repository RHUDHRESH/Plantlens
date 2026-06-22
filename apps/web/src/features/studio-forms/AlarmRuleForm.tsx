import { createFieldPatch, createNestedFieldPatch } from "./bundlePatch";
import { FormField } from "./FormField";
import type { StudioDraftIssue, StudioDraftPatch } from "./studioDraftTypes";

interface AlarmRuleFormProps {
  rule: Record<string, unknown>;
  tagOptions: Array<{ id: string; label: string }>;
  issues: StudioDraftIssue[];
  onPatch: (patch: StudioDraftPatch) => void;
}

function readString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === "string" ? v : "";
}

function readCondition(obj: Record<string, unknown>): Record<string, unknown> {
  const c = obj.condition;
  return c && typeof c === "object" && !Array.isArray(c) ? (c as Record<string, unknown>) : {};
}

export function AlarmRuleForm({ rule, tagOptions, issues, onPatch }: AlarmRuleFormProps) {
  const ruleId = readString(rule, "id");
  const tagRefIssue = issues.find((i) => i.targetId === ruleId && i.code === "UNKNOWN_TAG_REF");
  const condition = readCondition(rule);

  function patchField(field: string, value: unknown, reason: string) {
    onPatch(
      createFieldPatch("alarm_rules", {
        arrayKey: "rules",
        idKey: "id",
        targetId: ruleId,
        field,
        value,
        reason,
      }),
    );
  }

  return (
    <form className="studio-form-shell__form" onSubmit={(e) => e.preventDefault()}>
      <FormField label="Rule ID" hint="ID rename requires cross-reference migration.">
        <input value={ruleId} readOnly disabled aria-readonly />
      </FormField>
      <FormField label="Tag" {...(tagRefIssue?.message ? { error: tagRefIssue.message } : {})}>
        <select
          value={readString(rule, "tag")}
          onChange={(e) => patchField("tag", e.target.value, "Update alarm tag reference")}
        >
          <option value="">— select tag —</option>
          {tagOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Message">
        <input
          value={readString(rule, "message")}
          onChange={(e) => patchField("message", e.target.value, "Update alarm message")}
        />
      </FormField>
      {"severity" in rule ? (
        <FormField label="Severity">
          <select
            value={readString(rule, "severity")}
            onChange={(e) => patchField("severity", e.target.value, "Update severity")}
          >
            <option value="info">info</option>
            <option value="warning">warning</option>
            <option value="critical">critical</option>
          </select>
        </FormField>
      ) : null}
      {"priority" in rule ? (
        <FormField label="Priority">
          <input
            type="number"
            value={String(rule.priority ?? "")}
            onChange={(e) => patchField("priority", Number(e.target.value), "Update priority")}
          />
        </FormField>
      ) : null}
      {"condition" in rule ? (
        <>
          <FormField label="Operator">
            <select
              value={readString(condition, "op")}
              onChange={(e) =>
                onPatch(
                  createNestedFieldPatch("alarm_rules", {
                    arrayKey: "rules",
                    idKey: "id",
                    targetId: ruleId,
                    nestedKey: "condition",
                    field: "op",
                    value: e.target.value,
                    reason: "Update condition operator",
                  }),
                )
              }
            >
              <option value=">">&gt;</option>
              <option value="<">&lt;</option>
              <option value=">=">&gt;=</option>
              <option value="<=">&lt;=</option>
              <option value="==">==</option>
              <option value="!=">!=</option>
              <option value="bool_true">bool_true</option>
              <option value="bool_false">bool_false</option>
            </select>
          </FormField>
          {"threshold" in condition || condition.threshold !== undefined ? (
            <FormField label="Threshold">
              <input
                type="number"
                value={String(condition.threshold ?? "")}
                onChange={(e) =>
                  onPatch(
                    createNestedFieldPatch("alarm_rules", {
                      arrayKey: "rules",
                      idKey: "id",
                      targetId: ruleId,
                      nestedKey: "condition",
                      field: "threshold",
                      value: Number(e.target.value),
                      reason: "Update threshold",
                    }),
                  )
                }
              />
            </FormField>
          ) : null}
        </>
      ) : null}
      {"deadband" in rule ? (
        <FormField label="Deadband">
          <input
            type="number"
            value={String(rule.deadband ?? "")}
            onChange={(e) => patchField("deadband", Number(e.target.value), "Update deadband")}
          />
        </FormField>
      ) : null}
      {"enabled" in rule ? (
        <FormField label="Enabled">
          <input
            type="checkbox"
            checked={Boolean(rule.enabled)}
            onChange={(e) => patchField("enabled", e.target.checked, "Toggle enabled")}
          />
        </FormField>
      ) : null}
    </form>
  );
}