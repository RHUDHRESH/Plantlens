# Change pipeline and causal pattern library

> **CURRENT SOURCE OF TRUTH — safe for build agents.**

The runtime only ever believes an **engineer-approved, validated, versioned** bundle (R2/R5/R6).

## Flow

```
proposer (agent | pattern library | Studio | engineer)
   │  ChangeSet: typed ops keyed by id (never free-form JSON patch)
   ▼
POST /api/changes ──► change request "pending"
   │  preview = apply to the current revision + JSON Schema + graph compile + per-entity diff
   ▼
POST /api/changes/{id}/review   (human engineer/admin only, comment required)
   ├─ reject  ──► "rejected" (audited)
   ├─ base revision moved ──► "stale" (409; re-submit, never silently rebased)
   ├─ result fails schema/compile ──► 422, stays "pending"
   └─ approve ──► revision N+1 (immutable snapshot) ──► atomic runtime swap ──► "deployed"
POST /api/changes/rollback  (admin) ──► old snapshot re-deployed as revision N+2
```

| Module | Role |
|--------|------|
| `apps/api/app/changes/ops.py` | `ChangeSet` op allow-list: `add_edge`, `update_edge` (editable fields only), `remove_edge`, `upsert_node`, `add_root_cause_rule`, `add_situation_type`, `add_alarm_rule`, `update_alarm_rule`. Proposers can never set `approved: true`; only the reviewer's `approve_edges` decision can. |
| `apps/api/app/changes/validation.py` | JSON Schema checks (Draft 2020-12, `packages/contracts`), the graph compile (cycle policy), and alarm tag and asset references. |
| `apps/api/app/changes/service.py` | Submit, review, revisions, deploy, rollback, and the audit entries for each. |
| `apps/api/app/runtime/config_loader.py` | `deploy_runtime_config` swaps in a new immutable config under a lock and reconciles per-rule alarm state. |
| `authored_bundle_revision`, `authored_change_request` | Tables added by migration `0002_change_pipeline`. |

**Audit actions:**
- `change.draft.create`
- `change.review.approve`, `change.review.reject`, `change.review.stale`
- `bundle.revision.create`
- `runtime.deploy`
- `runtime.rollback`

**Startup:** the newest deployed revision is restored. While a revision is live, the Studio file
compile no longer hot-reloads from disk.

**Four-eyes:** `CHANGE_REQUIRE_DISTINCT_REVIEWER=true` stops authors from approving their own
changes.

## Causal pattern library

**Where it lives:**
- Patterns: `packages/sample-data/component-library/causal_patterns/<component_type>.json`
- Schema: `packages/contracts/causal_pattern_library.schema.json`

**What a pattern holds:**
- Required and optional signal roles.
- Symptoms with direction, onset lag window, weight and a threshold hint.
- The internal mechanism, including named reinforcing or balancing loops.
- Propagation to neighbour relations: `upstream_supply`, `driver`, `driven_equipment` and so on.
- Discriminators against look-alike patterns.
- Spectral or trend signatures.
- Ordered safe checks.

**Instantiation** (`apps/api/app/library/instantiate.py`) takes a pattern and an asset:

1. **Bind roles to tags.** The order of precedence is: an explicit binding, then the `role` field
   in `tag_map`, then the `signal_type` prefix, then a name hint. Ties are reported as
   *ambiguous* and never guessed.
2. **Resolve neighbours** from `plant.json` connections. Power connections that pass through a
   `drive.*` asset give a `driver` and an `upstream_supply` behind it.
3. **Stop if a required role is missing.** The result is an **observability-gap report**, with
   no change set.
4. **Otherwise produce a draft `ChangeSet`:**
   - alarm rules for bound symptoms, reusing an existing rule on the same tag and direction;
   - node evidence tags, fast expected symptoms and a first-out fingerprint rule;
   - unapproved `pattern_library` edges to neighbours, skipping relations that are already
     modelled and keeping `loop_ok`/`loop_id` for paired feedback loops;
   - a situation type.

**Endpoints:**

| Method | Path | Role |
|--------|------|------|
| GET | `/api/library/patterns` | viewer |
| GET | `/api/library/patterns/{pattern_id}` | viewer |
| GET | `/api/library/patterns/coverage/{asset_id}` | viewer. Which failure modes are observable with today's instrumentation, and which roles are missing. |
| POST | `/api/library/patterns/{pattern_id}/instantiate` `{asset_id, bindings?, neighbours?, submit?}` | engineer |
