# apps/web/src/app/schemas — Zod schemas (frontend mirror of packages/contracts)

The third mirror of the contract spine (JSON Schema → Pydantic → **Zod**). These power the Studio
forms (react-hook-form + `zodResolver`) and validate anything the client constructs before sending.

## Files (one per authored contract the user edits)
| File | Mirrors | Used by |
|------|---------|---------|
| `projectSchema.ts` | plant.json (project header) | ProjectForm |
| `assetSchema.ts` | plant.assets[] | AssetForm |
| `tagSchema.ts` | tag_map.tags[] | TagForm |
| `alarmRuleSchema.ts` | alarm_rules.rules[] | AlarmRuleForm |
| `causalEdgeSchema.ts` | causal_graph.edges[] | CausalEdgeForm |
| `roleViewSchema.ts` | plant.roles / role views | RoleViewForm |
| `actionSchema.ts` | action_envelope.actions[] | ActionEnvelopeForm |

## Discipline
- Keep these IDENTICAL to the canonical JSON Schemas (same enums, same patterns, same constraints).
  Zod 4 → JSON Schema lets you diff against `packages/contracts` in CI.
- Prefer generating TS request/response *types* from the API's OpenAPI; hand-author only the *form*
  schemas here (forms need Zod for validation messages + resolver).
- Example: `assetSchema` uses `z.string().regex(/^[A-Z0-9-]+$/)` for the id and
  `z.enum([...asset types...])` matching plant.schema.json exactly.

CHUNK: 9
