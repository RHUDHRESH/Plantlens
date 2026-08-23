"""OTEL spans and Prometheus metrics — optional observability extras.

Hooks (safe no-ops when prometheus_client is missing):
  record_ingest_frame / record_ws_broadcast
  record_tick_error / record_situation_created / record_llm_fallback

init_observability(otlp_endpoint="") is a no-op when the endpoint is unset
or OpenTelemetry packages are unavailable — lifespan must never crash on that.
"""

from __future__ import annotations

import time
from contextlib import contextmanager
from typing import Any, Generator

try:
    from prometheus_client import Counter, Histogram, generate_latest

    INGEST_FRAMES = Counter("plantlens_ingest_frames_total", "TagFrames accepted via ingest")
    WS_BROADCASTS = Counter("plantlens_ws_broadcasts_total", "WebSocket broadcast messages")
    INGEST_LATENCY = Histogram("plantlens_ingest_latency_seconds", "Ingest frame processing latency")
    TICK_ERRORS = Counter("plantlens_tick_errors_total", "Runtime / simulator tick failures")
    SITUATIONS_CREATED = Counter(
        "plantlens_situations_created_total",
        "New Situation records created by runtime_tick",
    )
    LLM_FALLBACK = Counter(
        "plantlens_llm_fallback_total",
        "AI harness demotions to deterministic answer (guard fail or LLM error)",
    )
    _PROMETHEUS = True
except ImportError:
    _PROMETHEUS = False
    INGEST_FRAMES = None
    WS_BROADCASTS = None
    INGEST_LATENCY = None
    TICK_ERRORS = None
    SITUATIONS_CREATED = None
    LLM_FALLBACK = None

_tracer: Any = None


def init_observability(*, otlp_endpoint: str = "") -> None:
    """Configure OTLP tracing when an endpoint is set; otherwise leave tracer unset."""
    global _tracer
    if not otlp_endpoint:
        _tracer = None
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


def record_tick_error() -> None:
    if _PROMETHEUS and TICK_ERRORS is not None:
        TICK_ERRORS.inc()


def record_situation_created() -> None:
    if _PROMETHEUS and SITUATIONS_CREATED is not None:
        SITUATIONS_CREATED.inc()


def record_llm_fallback() -> None:
    if _PROMETHEUS and LLM_FALLBACK is not None:
        LLM_FALLBACK.inc()


def metrics_payload() -> bytes | None:
    if not _PROMETHEUS:
        return None
    return generate_latest()
