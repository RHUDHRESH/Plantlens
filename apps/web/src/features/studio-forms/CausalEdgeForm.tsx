import { createFieldPatch } from "./bundlePatch";
import { FormField } from "./FormField";
import type { StudioDraftIssue, StudioDraftPatch } from "./studioDraftTypes";

interface CausalEdgeFormProps {
  edge: Record<string, unknown>;
  nodeOptions: Array<{ id: string; label: string }>;
  issues: StudioDraftIssue[];
  onPatch: (patch: StudioDraftPatch) => void;
}

function readString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === "string" ? v : "";
}

export function CausalEdgeForm({ edge, nodeOptions, issues, onPatch }: CausalEdgeFormProps) {
  const edgeId = readString(edge, "id");
  const nodeRefIssue = issues.find((i) => i.targetId === edgeId && i.code === "UNKNOWN_NODE_REF");
  const notApproved = issues.find((i) => i.targetId === edgeId && i.code === "EDGE_NOT_APPROVED");

  function patchField(field: string, value: unknown, reason: string) {
    onPatch(
      createFieldPatch("causal_graph", {
        arrayKey: "edges",
        idKey: "id",
        targetId: edgeId,
        field,
        value,
        reason,
      }),
    );
  }

  return (
    <form className="studio-form-shell__form" onSubmit={(e) => e.preventDefault()}>
      <FormField label="Edge ID" hint="ID rename requires cross-reference migration.">
        <input value={edgeId} readOnly disabled aria-readonly />
      </FormField>
      <FormField label="From" {...(nodeRefIssue?.message ? { error: nodeRefIssue.message } : {})}>
        <select
          value={readString(edge, "from")}
          onChange={(e) => patchField("from", e.target.value, "Update edge from node")}
        >
          <option value="">— select node —</option>
          {nodeOptions.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label} ({n.id})
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="To">
        <select
          value={readString(edge, "to")}
          onChange={(e) => patchField("to", e.target.value, "Update edge to node")}
        >
          <option value="">— select node —</option>
          {nodeOptions.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label} ({n.id})
            </option>
          ))}
        </select>
      </FormField>
      {"approved" in edge ? (
        <FormField
          label="Approved"
          hint={
            notApproved || edge.approved === false
              ? "Visible in Studio, not runtime traversed."
              : "Approved edges may be traversed at runtime after compile."
          }
        >
          <input
            type="checkbox"
            checked={Boolean(edge.approved)}
            onChange={(e) => patchField("approved", e.target.checked, "Toggle edge approval")}
          />
        </FormField>
      ) : null}
      {"provenance" in edge ? (
        <FormField label="Provenance">
          <input
            value={readString(edge, "provenance")}
            onChange={(e) => patchField("provenance", e.target.value, "Update provenance")}
          />
        </FormField>
      ) : null}
      {"confidence" in edge ? (
        <FormField label="Confidence">
          <input
            type="number"
            step="0.1"
            min="0"
            max="1"
            value={String(edge.confidence ?? "")}
            onChange={(e) => patchField("confidence", Number(e.target.value), "Update confidence")}
          />
        </FormField>
      ) : null}
      {"lag_ms" in edge && Array.isArray(edge.lag_ms) ? (
        <FormField label="Lag range (ms)">
          <span className="studio-form-field__hint">
            {(edge.lag_ms as number[])[0]} – {(edge.lag_ms as number[])[1]} ms (read-only in draft shell)
          </span>
        </FormField>
      ) : null}
    </form>
  );
}