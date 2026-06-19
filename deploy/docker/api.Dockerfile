# PlantLens API image (FastAPI). Build context = repo root.
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

# deps first for layer caching
COPY apps/api/pyproject.toml /app/
RUN pip install --no-cache-dir .

COPY apps/api/app /app/app
COPY apps/api/alembic.ini /app/
# migrations/ added in Prompt 7 (DB layer); uncomment when alembic versions exist:
# COPY apps/api/migrations /app/migrations
# contracts + sample bundle are read at runtime by the compiler
COPY packages/contracts /packages/contracts
COPY packages/sample-data /packages/sample-data

EXPOSE 8000
# single worker for MVP (in-memory runtime_state). Scale workers only after moving state to Redis.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
