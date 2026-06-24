# Build / lint / run commands for coding agents

## Backend (uv-managed, Python 3.12)
- Install: `uv sync` (creates .venv with Python 3.12)
- Run dev server: `uv run uvicorn app.main:app --reload --port 8000`
- Run orchestrator smoke test: `uv run python -m app.tests.test_pipeline`
- Lint: `uv run ruff check app`
- Type check: `uv run pyright app` (if installed)

## Frontend (pnpm workspace, Node 24)
- Install: `pnpm install`
- Dev: `pnpm dev` (Vite on :5173)
- Build: `pnpm build` (outputs frontend/dist, served by FastAPI in prod)
- Studio dev: `pnpm studio`
- Typecheck: `pnpm typecheck`

## End-to-end verification
- Start backend, then `pnpm dev`; open http://localhost:5173
- A simulator tick must produce validated CanonicalValues and one Situation per scripted scenario.

## Laws (inviolable)
1. PlantLens reads, never writes. No write methods exist on SourceAdapter.
2. AI proposes, engineer approves, deterministic engine executes.
3. No ML in the live path. scikit-learn only loads frozen artifacts; `.fit()` never runs live.
