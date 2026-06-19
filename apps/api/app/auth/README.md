# apps/api/app/auth — identity + RBAC

Boring and tight. Production uses an external OIDC provider (Keycloak/Entra/Auth0); local dev/test
uses an explicit HS256 bootstrap when OIDC env vars are unset. **Agents get a role, never a bypass
(R5).**

## Files
| File | Purpose |
|------|---------|
| `principal.py` | `Principal`, `Role`, `ActorType`, role sets |
| `service.py` | Verify bearer JWT (Authlib): OIDC or dev JWT → `Principal` |
| `dependencies.py` | `get_current_principal`, `require_roles`, `require_human_approver` |

Internal probe routes live in `app/routers/internal_auth.py` (`/internal/auth-test/*`) for tests
only — not product write endpoints.

## Auth modes
| Mode | When | Behavior |
|------|------|----------|
| `oidc` | `OIDC_ISSUER`, `OIDC_JWKS_URL`, `OIDC_AUDIENCE` all set | Verify RS/ES JWT against issuer |
| `dev_jwt` | `PLANTLENS_ENV` is `dev` or `test` and `PLANTLENS_DEV_JWT_SECRET` is set | Verify HS256 dev tokens |
| `unconfigured` | Otherwise (e.g. prod without OIDC) | Protected routes return **503** — no bypass |

## Roles (from token `role` or `plantlens_role` claim)
| Role | Can |
|------|-----|
| `viewer` | dashboards, maps, telemetry (read-only) |
| `operator` | ack alarms, escalate, run scenarios, approve human-gated actions |
| `maintenance` | + maintenance checklist, PLC bridge requests |
| `engineer` | + edit Studio config, approve agent drafts, compile |
| `admin` | + user/org/project controls |
| `agent` | service identity: draft-only tools; **cannot** ack, write hardware, or approve |

## Enforcement
`require_roles(...)` and `require_human_approver` guard mutating endpoints. Every privileged action
writes an audit record with `actor_id` + `actor_role` (R6).

## Dev bootstrap
Set `PLANTLENS_DEV_JWT_SECRET` in dev/test only. `POST /internal/auth-test/dev-token` issues local
tokens when `PLANTLENS_ENV` is `dev` or `test`; returns 404 in prod.

## Don't
- Invent username/password auth for production.
- Set `PLANTLENS_DEV_JWT_SECRET` in prod — use OIDC instead.
- Let the `agent` role pass human-approver gates, even with broad JWT claims.