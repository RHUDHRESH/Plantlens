# PlantLens gateway image (Modbus/RS485 + line-mode serial). Build context = repo root.
# Real hardware: pass the adapter through with a STABLE path, e.g.
#   --device=/dev/serial/by-id/usb-1a86_USB_Serial-if00-port0:/dev/ttyPLANTLENS0
# and set GATEWAY_SERIAL_PORT=/dev/ttyPLANTLENS0 (see apps/gateway/README.md).
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    TAG_MAP_PATH=/packages/sample-data/demo-microgrid/tag_map.json \
    HEALTH_PORT=9101
WORKDIR /app
# The package must be present before `pip install .` (hatch builds the `gateway` package).
COPY apps/gateway/pyproject.toml /app/
COPY apps/gateway/gateway /app/gateway
RUN pip install --no-cache-dir .
COPY packages/contracts /packages/contracts
COPY packages/sample-data /packages/sample-data
EXPOSE 9101
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:9101/health', timeout=2).status == 200 else 1)"
CMD ["python", "-m", "gateway.main"]
