# PlantLens API image (FastAPI). Build context = repo root.
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

# The package must be present before `pip install .` (hatch builds the `app` package).
COPY apps/api/pyproject.toml /app/
COPY apps/api/app /app/app
RUN pip install --no-cache-dir .

COPY apps/api/alembic.ini /app/
COPY apps/api/migrations /app/migrations
# contracts + sample bundle are read at runtime (validation, compiler, pattern library)
COPY packages/contracts /packages/contracts
COPY packages/sample-data /packages/sample-data
ENV SAMPLE_DATA_DIR=/packages/sample-data/demo-microgrid \
    COMPONENT_LIBRARY_DIR=/packages/sample-data/component-library \
    DATABASE_URL=sqlite+aiosqlite:////data/plantlens.db
RUN mkdir -p /data

EXPOSE 8000
# Migrate, then serve. Single worker for MVP (in-memory runtime_state); scale workers only after
# moving runtime state out of process.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
