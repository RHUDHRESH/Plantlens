"""OTEL spans and Prometheus metrics — optional observability extras."""

from __future__ import annotations

import time
from contextlib import contextmanager
from typing import Any, Generator

try:
    from prometheus_client import Counter, Histogram, generate_latest

    INGEST_FRAMES = Counter("plantlens_ingest_frames_total", "TagFrames accepted via ingest")
    WS_BROADCASTS = Counter("plantlens_ws_broadcasts_total", "WebSocket broadcast messages")
    INGEST_LATENCY = Histogram("plantlens_ingest_latency_seconds", "Ingest frame processing latency")
    _PROMETHEUS = True
except ImportError:
    _PROMETHEUS = False
    INGEST_FRAMES = None
    WS_BROADCASTS = None
    INGEST_LATENCY = None

_tracer: Any = None


def init_observability(*, otlp_endpoint: str = "") -> None:
    global _tracer
    if not otlp_endpoint:
        return
    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        provider = TracerProvider()
        provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=otlp_endpoint)))
        trace.set_tracer_provider(provider)
        _tracer = trace.get_tracer("plantlens.api")
    except Exception:
        _tracer = None


@contextmanager
def ingest_span(tag_id: str) -> Generator[None, None, None]:
    start = time.perf_counter()
    if _tracer is not None:
        with _tracer.start_as_current_span("ingest.frame", attributes={"tag_id": tag_id}):
            yield
    else:
        yield
    elapsed = time.perf_counter() - start
    if _PROMETHEUS and INGEST_LATENCY is not None:
        INGEST_LATENCY.observe(elapsed)


def record_ingest_frame() -> None:
    if _PROMETHEUS and INGEST_FRAMES is not None:
        INGEST_FRAMES.inc()


def record_ws_broadcast() -> None:
    if _PROMETHEUS and WS_BROADCASTS is not None:
        WS_BROADCASTS.inc()


def metrics_payload() -> bytes | None:
    if not _PROMETHEUS:
        return None
    return generate_latest()