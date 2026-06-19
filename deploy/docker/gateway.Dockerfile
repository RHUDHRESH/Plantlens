# PlantLens gateway image (Modbus/RS485). Build context = repo root.
# Needs device access for real RS485: run with `--device=/dev/ttyUSB0` (or compose `devices:`).
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY apps/gateway/pyproject.toml /app/
RUN pip install --no-cache-dir .
COPY apps/gateway/gateway /app/gateway
COPY packages/contracts /packages/contracts
COPY packages/sample-data /packages/sample-data
CMD ["python", "-m", "gateway.main"]
