# deploy/k8s — fleet phase (LATER, not now)

Kubernetes is an operating environment, not a product feature. Stay on Docker Compose until the
business earns K8s (multi-site fleet, central management plane). When you get there, add:

- `api-deployment.yaml` (single replica until runtime_state moves to Redis), `web-deployment.yaml`
- `gateway-daemonset.yaml` (one per edge node, with device mounts)
- `postgres-statefulset.yaml` (or a managed Postgres), `redis-deployment.yaml`
- `ingress.yaml`, `secrets` via a secret manager (never in-repo)
- a migration `Job`, readiness/liveness probes hitting `/readyz` and the gateway `/health`

Phase plan is in `docs/ARCHITECTURE.md` (Phase 1 compose → Phase 2 edge split → Phase 3 fleet).
