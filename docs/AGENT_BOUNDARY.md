# Agent Boundary

## Core rules

1. **AI does not diagnose live faults.** Root cause is computed by `dag_runtime.py`.
2. **AI drafts and explains** based on `RuntimeEvidencePacket`.
3. **Runtime remains available** if agents are down (`service_unavailable` fallback).
4. **Graph/rule changes require human approval** and contract validation.
5. **PlantLens is advisory and read-only** — no PLC/hardware writes.

## Allowed agent inputs

- `RuntimeEvidencePacket` (read-only)
- authored bundle context
- engineer prompts

## Allowed agent outputs

- `DraftArtifact` with `proposed_changes[]`
- explanations referencing existing evidence only
- `status: pending` until human approve/reject

## Forbidden

- Mutating live runtime state
- Auto-approving drafts
- `write_modbus`, `toggle_output`, hardware control tools
- Fabricating causal edges when service is offline

## Approval flow

```
agent draft → pending queue → human approve/reject → audit hash-chain
  → (future) contract patch → compile → runtime picks up new bundle
```

Current MVP: approve stores audited artifact; runtime unchanged until Studio compile path writes contracts.

## Fallback behavior

When `apps/agents` is unreachable, API returns:

```json
{
  "artifact_type": "service_unavailable",
  "summary": "Agent service unavailable. Runtime unaffected.",
  "proposed_changes": []
}
```

No demo edges. No fake root-cause changes.