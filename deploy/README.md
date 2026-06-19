# deploy — packaging, compose, CI

Phase 1 is **Docker Compose on one host** (demo/pilot). Kubernetes only when the business earns it
(docs/ARCHITECTURE.md). GitHub Actions is the CI shell.

## Files
| Path | Purpose |
|------|---------|
| `docker/api.Dockerfile` | FastAPI image |
| `docker/web.Dockerfile` | build the Vite app, serve via nginx |
| `docker/gateway.Dockerfile` | Modbus gateway image |
| `docker/agents.Dockerfile` | draft-only agents image (optional) |
| `docker/compose.full.yml` | full local stack: api + web + gateway + postgres (+ agents, otel) |
| `docker/compose.edge.yml` | edge deployment: gateway on-site, API/web/audit central |
| `k8s/` | manifests for the fleet phase (later) |

## CI (.github/workflows/ci.yml)
Jobs: backend lint+type+test, frontend typecheck+build+test, **contract-validate** (the schema
canary), golden parity (cliffords oracle), e2e smoke, build images. PRs must pass before merge.

## Run locally
```bash
docker compose -f deploy/docker/compose.full.yml up --build
```
For the first MVP you can skip Postgres (SQLite) and run api+web only.
