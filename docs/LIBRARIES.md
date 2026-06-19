# PlantLens Libraries — how to get them, and exactly which parts to use

This answers "how do we get the libraries, what parts of the libraries." For each dependency:
**install command**, **the specific import surface you actually use**, and **what NOT to reach
for**. Version pins are the research-validated baseline (June 2026); pin exact patches in your
lockfiles and put Renovate/Dependabot on a controlled update policy.

Install per chunk, not all at once. The chunk a library belongs to is in `[brackets]`.

---

## Backend — `apps/api` (Python 3.12)

Use `uv` (fast) or `pip` + `venv`. `pyproject.toml` already lists these.

### fastapi `~0.137`  `[Chunk 1]`
```bash
uv add "fastapi~=0.137"
```
- **Use:** `FastAPI()`, `APIRouter(prefix=..., tags=...)`, path/query params with Pydantic models,
  `Depends()` for auth/db sessions, `WebSocket` + `WebSocketDisconnect`, `BackgroundTasks`,
  `HTTPException`, the auto-generated OpenAPI (`/docs`, `/openapi.json`) which you export to
  `packages/contracts/openapi/` to generate TS types.
- **Don't:** hand-write request validation (let Pydantic models do it); don't build your own
  OpenAPI; don't put blocking I/O in async routes (use `httpx`/async drivers).

### uvicorn[standard] `~0.49`  `[Chunk 1]`
```bash
uv add "uvicorn[standard]~=0.49"
```
- **Use:** `uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload` (dev). `[standard]` pulls
  the websocket + httptools extras you need.
- **Don't:** run multiple workers with in-memory `runtime_state` (state won't be shared — use
  one worker for MVP, move shared state to Redis when you scale).

### pydantic `~2.13` + pydantic-settings `~2.7`  `[Chunk 1]`
```bash
uv add "pydantic~=2.13" "pydantic-settings~=2.7"
```
- **Use:** `BaseModel`, `Field(pattern=..., ge=..., default_factory=...)`, `Literal[...]` enums,
  `model_dump()`/`model_validate()`, `model_json_schema()` (emit JSON Schema to keep
  `packages/contracts` in sync), strict types. `BaseSettings` for typed env config.
- **Don't:** confuse Pydantic transport models (`app/schemas/`) with SQLAlchemy ORM models
  (`app/db/models/`). They are different layers on purpose (see `apps/api/app/schemas/README.md`).

### SQLAlchemy `2.0.x` + alembic `~1.18` + aiosqlite `~0.22` (MVP) / psycopg `~3.2` (prod)  `[Chunk 1]`
```bash
uv add "sqlalchemy~=2.0" "alembic~=1.18" "aiosqlite~=0.22"   # MVP
uv add "psycopg[binary]~=3.2"                                  # when moving to Postgres
```
- **Use:** 2.0 typed style — `Mapped[...]`, `mapped_column(...)`, `DeclarativeBase`, async
  `AsyncSession`/`create_async_engine`. Alembic `autogenerate` for migrations.
- **Don't:** use legacy 1.x Query API; don't store derived runtime state in the same tables as
  authored config.

### networkx `~3.3`  `[Chunk 3 + Chunk 4]`
```bash
uv add "networkx~=3.3"
```
- **Use (authoring/validation only):** `DiGraph`, `is_directed_acyclic_graph(G)`,
  `topological_sort(G)` / `lexicographical_topological_sort`, `simple_cycles` to report the
  offending edge chain. Use at **compile time** to reject cycles and order propagation.
- **Don't:** use NetworkX on the runtime hot path. The live DAG traversal uses plain
  precomputed adjacency / reverse-adjacency dicts (O(V+E), no library overhead).

### pyyaml `~6`  `[Chunk 4]`
```bash
uv add "pyyaml~=6"
```
- **Use:** `yaml.safe_load(...)` to read `action_envelope.yaml`. Always `safe_load`, never `load`.

### structlog `~24` + opentelemetry + prometheus-client  `[Chunk 1 + Chunk 13]`
```bash
uv add "structlog~=24" "opentelemetry-sdk~=1.35" "opentelemetry-exporter-otlp" "prometheus-client~=0.25"
```
- **Use:** structlog JSON renderer for correlated logs (bind `trace_id`, `plant_id`, `run_id`).
  OTEL one span chain per ingest cycle. `Counter`/`Histogram` for ingest rate + WS latency.
- **Don't:** print(); don't add tracing so heavy it slows the tick.

### orjson `~3.10`  `[Chunk 2]`
```bash
uv add "orjson~=3.10"
```
- **Use:** fast JSON for WebSocket frames and snapshot serialization.

### Auth — Authlib `~1.7` (prod OIDC) or python-jose + passlib (local bootstrap)  `[Chunk 1]`
```bash
uv add "authlib~=1.7"                                   # production OIDC/JWT verify
uv add "python-jose[cryptography]" "passlib[bcrypt]"    # local dev bootstrap only
```
- **Use:** verify tokens from an external IdP (Keycloak/Entra/Auth0); resolve RBAC in the backend.
- **Don't:** invent username/password auth for production; agents get a *role*, not a bypass.

---

## Gateway — `apps/gateway` (Python 3.12, separate process)

### pymodbus[serial] `~3.13` + pyserial `3.5`  `[Chunk 7]`
```bash
uv add "pymodbus[serial]~=3.13" "pyserial~=3.5"
```
- **Use:** `from pymodbus.client import AsyncModbusSerialClient` (RTU/RS485) and
  `ModbusSerialClient`; `read_holding_registers` / `read_input_registers` (FC03/FC04) for the
  read path; `write_register`/`write_registers` (FC06/FC16) **only** for the advisory PLC bridge
  behind an allowlist. Use the **3.x** simulator/server for tests (the v4 simulator is WIP — do
  not anchor a demo on it).
- **Don't:** allow arbitrary writes from Studio; don't compute anything beyond decode+quality here.

### tenacity `~9`, httpx `~0.28`, structlog  `[Chunk 7]`
```bash
uv add "tenacity~=9" "httpx~=0.28" "structlog~=24"
```
- **Use:** tenacity `@retry` with backoff for poll resilience; httpx async to publish frames to
  the API; structlog for per-device diagnostic counters.

---

## Agents — `apps/agents` (Python 3.12, optional, draft-only)

### langgraph (latest stable) + langchain `~1.x` (sparingly)  `[Chunk 11]`
```bash
uv add langgraph langchain
```
- **Use:** LangGraph for stateful, persistent, **human-in-the-loop** workflows (the approval
  gate is a first-class node). LangChain only for `create_agent` / provider abstraction / quick
  tool wiring.
- **Don't:** give agents tools that write hardware, mutate the live graph, or auto-approve.

### Provider SDK — openai (primary) and/or google-genai (secondary)  `[Chunk 11]`
```bash
uv add openai            # primary drafting engine: function calling, structured outputs
uv add google-genai      # secondary / fallback
```
- **Use:** structured outputs / function calling to force schema-constrained drafts. Always behind
  provider-agnostic adapters in `apps/agents/agents/registry.py`.
- **Don't:** put the provider call anywhere on the live diagnosis path.

### Retrieval — SQLite FTS5 first, chromadb later  `[Chunk 11]`
```bash
# FTS5 ships with sqlite3 — no install. Add chroma only when the corpus is large:
uv add chromadb
```
- **Use:** FTS5 for bounded doc/runbook/incident retrieval at first. Chroma for embeddings +
  metadata-filtered semantic search when FTS5 stops being enough. Vectors are for *unstructured
  operator knowledge*, never for the deterministic fault matrix.

---

## Frontend — `apps/web` (Node 22 LTS, pnpm 10)

```bash
corepack enable && corepack prepare pnpm@10 --activate
```

### react `19.2` + react-dom + typescript `5.x` + vite `7.x`  `[Chunk 5]`
```bash
pnpm add react@19 react-dom@19
pnpm add -D typescript vite @vitejs/plugin-react
```
- **Use:** function components + hooks; `React.lazy` + `Suspense` to route-split the 3D scene.
  Vite 7 needs Node 20.19+ or 22.12+.
- **Don't:** reach for Next.js (no SSR need); don't put runtime truth in component state.

### @tanstack/react-query `^5` + zustand `^5`  `[Chunk 5]`
```bash
pnpm add @tanstack/react-query zustand
```
- **Use:** React Query for *server* data (plants, compiled bundle, incidents) — caching +
  invalidation. Zustand for the *live runtime stream cache* (`runtime.ts`) and local UI/editor
  state. Split state by responsibility — do not build one giant global store.
- **Don't:** fetch live tags via React Query polling; live data comes over the WebSocket.

### tailwindcss `4.x` + @radix-ui/* + lucide-react + motion  `[Chunk 5]`
```bash
pnpm add tailwindcss @tailwindcss/vite
pnpm add @radix-ui/react-dialog @radix-ui/react-tabs @radix-ui/react-tooltip @radix-ui/react-dropdown-menu
pnpm add lucide-react motion
```
- **Use:** Tailwind 4 via the Vite plugin + CSS variables for design tokens (see
  `docs/DESIGN_SYSTEM.md`). Radix headless primitives for accessible Dialog/Tabs/Tooltip. Lucide
  for UI chrome icons (tree-shaken inline SVG). `motion` (`import { motion } from "motion/react"`)
  for tasteful state transitions; honor `useReducedMotion` globally.
- **Don't:** abuse Lucide for process/electrical symbols — build a dedicated SVG symbol library
  for breakers/motors/buses/sensors. No clown gradients, no bouncing widgets.

### Forms — react-hook-form `^7` + @hookform/resolvers + zod `4.x`  `[Chunk 9]`
```bash
pnpm add react-hook-form @hookform/resolvers zod
```
- **Use:** RHF `useForm({ resolver: zodResolver(schema) })`; Zod schemas mirror the backend
  Pydantic contracts 1:1 (`src/app/schemas/*`). Zod 4 → JSON Schema keeps both sides honest.
- **Don't:** let the graph editor be the authoring substrate; forms are the source of truth.

### Graph editor — @xyflow/react `12.x`  `[Chunk 9]`
```bash
pnpm add @xyflow/react
```
- **Use:** `ReactFlow`, `Background`, `Controls`, `MiniMap`, `Handle`, `Position`, `addEdge`,
  `applyNodeChanges`/`applyEdgeChanges`, custom `nodeTypes`/`edgeTypes`. Import the stylesheet
  `@xyflow/react/dist/style.css`.
- **Don't:** treat React Flow state as the database — the canonical JSON is the source of truth;
  React Flow is a view/editor over it (call `applyNodeChanges`, don't replace the store wholesale).

### 3D — three + @react-three/fiber `9.x` + @react-three/drei `10.x`  `[Chunk 8]`
```bash
pnpm add three @react-three/fiber @react-three/drei
pnpm add -D @types/three
```
- **Use:** `Canvas`, `useFrame`, `useThree`; from drei: `OrbitControls`, `Environment`, `Html`
  (anchored labels/Calm Card), `Line`, `Bounds`/camera helpers, `useGLTF` (later, with simplified
  meshes + instancing). R3F v9 pairs with React 19.
- **Don't:** start with postprocessing or GLTF models — use primitive geometry first; lazy-load
  the whole 3D route; keep `dpr={[1, 1.5]}`.

### Testing — vitest `4.x` + @testing-library/react + playwright  `[all chunks]`
```bash
pnpm add -D vitest @testing-library/react @testing-library/jest-dom jsdom @playwright/test
```
- **Use:** Vitest for units/components; Playwright for the E2E slice (import bundle → run
  scenario → alarm → Calm Card → audit record).

---

## Charts / data viz (when you need trends)  `[Chunk 6+]`
```bash
pnpm add recharts        # composable React/SVG charts — simplest
# or, for dense/custom: pnpm add d3-scale d3-shape d3-array
```
- **Use:** Recharts for standard trend strips. d3-scale/shape/array if you hand-roll sparklines
  inside SVG nodes.

---

## Legacy — `legacy/cliffords-ts` (frozen; do not upgrade)
Keep its existing deps exactly as-is (`csv-parse`, `luxon`, `xlsx`, `zod`, `vitest`). You only
*run* it as the regression oracle; you don't develop it further.
