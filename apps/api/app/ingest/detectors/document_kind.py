"""Deterministic document-kind detection for offline authored-knowledge ingestion."""

from __future__ import annotations

import re

from app.ingest.adapters.base import clean_header
from app.schemas.ingest.artifact import DocumentKind, RawArtifact
from app.schemas.ingest.detection import DetectionReport
from app.schemas.ingest.record import RawRecord

_SCORABLE_KINDS: tuple[DocumentKind, ...] = (
    "signal_list",
    "register_map",
    "alarm_history",
    "cause_effect_matrix",
    "operator_note",
)

_ASSET_HEADERS = frozenset({"asset_label", "asset", "equipment", "equipment_label"})
_SIGNAL_HEADERS = frozenset({"signal_label", "signal"})
_TAG_HEADERS = frozenset({"tag_hint", "tag", "tag_id"})
_UNIT_HEADERS = frozenset({"unit", "engineering_unit"})
_SIDE_HEADERS = frozenset({"side"})

_REGISTER_HEADERS = frozenset(
    {"register", "address", "register_address", "offset", "modbus_address"}
)
_DATA_TYPE_HEADERS = frozenset({"data_type", "datatype"})
_FUNCTION_CODE_HEADERS = frozenset({"function_code"})
_SCALE_HEADERS = frozenset({"scale", "scaling"})

_TIMESTAMP_HEADERS = frozenset({"timestamp", "time", "event_time"})
_ALARM_HEADERS = frozenset({"alarm", "alarm_name"})
_SEVERITY_HEADERS = frozenset({"severity", "priority"})
_STATE_HEADERS = frozenset({"active", "state"})
_SOURCE_HEADERS = frozenset({"source", "source_name"})
_ACK_HEADERS = frozenset({"acknowledged", "ack"})
_MESSAGE_HEADERS = frozenset({"message"})

_CAUSE_HEADERS = frozenset({"cause"})
_EFFECT_HEADERS = frozenset({"effect"})
_ACTION_HEADERS = frozenset({"action", "trip", "interlock"})
_CONDITION_HEADERS = frozenset({"condition", "permissive"})
_CONSEQUENCE_HEADERS = frozenset({"consequence", "delay"})
_TARGET_HEADERS = frozenset({"target", "output"})

_NOTE_HEADERS = frozenset(
    {"note", "notes", "operator_note", "comment", "comments", "description"}
)

_OPERATOR_TERMS = (
    "operator",
    "maintenance",
    "fault",
    "alarm",
    "process",
    "vibration",
    "startup",
    "checked",
    "noticed",
    "abnormal",
)


def extract_headers_from_records(records: list[RawRecord]) -> list[str]:
    """Collect cleaned header names from extracted raw records."""
    headers: set[str] = set()
    for record in records:
        headers.update(record.fields.keys())
    return sorted(headers)


def score_document_kinds(
    *,
    headers: list[str],
    text: str | None = None,
) -> dict[DocumentKind, tuple[float, list[str]]]:
    """Score each document kind from normalized headers and optional prose text."""
    normalized = {_normalize_header(header) for header in headers}
    scores: dict[DocumentKind, tuple[float, list[str]]] = {
        "signal_list": _score_signal_list(normalized),
        "register_map": _score_register_map(normalized),
        "alarm_history": _score_alarm_history(normalized),
        "cause_effect_matrix": _score_cause_effect_matrix(normalized),
        "operator_note": _score_operator_note_headers(normalized),
    }
    if text:
        text_score, text_signals = _score_operator_note_text(text)
        header_score, header_signals = scores["operator_note"]
        if text_score > header_score:
            scores["operator_note"] = (text_score, text_signals)
        elif text_score > 0:
            combined_score = max(header_score, text_score)
            combined_signals = sorted(set(header_signals + text_signals))
            scores["operator_note"] = (combined_score, combined_signals)
    return scores


def detect_document_kind(
    *,
    artifact: RawArtifact,
    records: list[RawRecord] | None = None,
    text: str | None = None,
    headers: list[str] | None = None,
) -> DetectionReport:
    """Classify an offline artifact using transparent, deterministic heuristics."""
    resolved_headers = list(headers or [])
    if records:
        resolved_headers = extract_headers_from_records(records)

    scores = score_document_kinds(headers=resolved_headers, text=text)
    ranked = sorted(scores.items(), key=lambda item: item[1][0], reverse=True)
    top_kind, (top_score, top_signals) = ranked[0]
    second_kind, (second_score, second_signals) = ranked[1] if len(ranked) > 1 else (None, (0.0, []))

    if (
        second_kind is not None
        and top_score >= 0.70
        and second_score >= 0.70
        and abs(top_score - second_score) <= 0.10
    ):
        tied_kinds = {
            kind
            for kind, (score, _) in ranked
            if score >= 0.70 and abs(score - top_score) <= 0.10
        }
        normalized_headers = {_normalize_header(header) for header in resolved_headers}
        if tied_kinds == {"signal_list", "register_map"} and bool(
            normalized_headers & _FUNCTION_CODE_HEADERS
        ):
            register_score, register_signals = scores["register_map"]
            return DetectionReport(
                artifact_id=artifact.artifact_id,
                run_id=artifact.run_id,
                document_kind="register_map",
                confidence=register_score,
                signals=register_signals + ["tiebreak:function_code"],
                supported=True,
                needs_human_label=False,
                reason=None,
            )

        ambiguous_signals = sorted(
            set(top_signals + second_signals + [f"ambiguous:{top_kind}", f"ambiguous:{second_kind}"])
        )
        return DetectionReport(
            artifact_id=artifact.artifact_id,
            run_id=artifact.run_id,
            document_kind="unknown",
            confidence=top_score,
            signals=ambiguous_signals,
            supported=False,
            needs_human_label=True,
            reason=f"Ambiguous document kind: {top_kind} vs {second_kind}",
        )

    if top_score < 0.60:
        all_signals = sorted({signal for _, (_, signals) in ranked for signal in signals})
        return DetectionReport(
            artifact_id=artifact.artifact_id,
            run_id=artifact.run_id,
            document_kind="unknown",
            confidence=top_score,
            signals=all_signals,
            supported=False,
            needs_human_label=True,
            reason="Could not classify document kind with sufficient confidence.",
        )

    return DetectionReport(
        artifact_id=artifact.artifact_id,
        run_id=artifact.run_id,
        document_kind=top_kind,
        confidence=top_score,
        signals=top_signals,
        supported=True,
        needs_human_label=False,
        reason=None,
    )


def _normalize_header(header: str) -> str:
    return clean_header(header)


def _header_signals(headers: set[str], aliases: frozenset[str]) -> list[str]:
    return [f"header:{header}" for header in sorted(headers & aliases)]


def _score_signal_list(headers: set[str]) -> tuple[float, list[str]]:
    signals = _header_signals(headers, _ASSET_HEADERS)
    signals.extend(_header_signals(headers, _SIGNAL_HEADERS))
    signals.extend(_header_signals(headers, _TAG_HEADERS))
    signals.extend(_header_signals(headers, _UNIT_HEADERS))
    signals.extend(_header_signals(headers, _SIDE_HEADERS))

    has_asset = bool(headers & _ASSET_HEADERS)
    has_signal = bool(headers & _SIGNAL_HEADERS)
    has_tag = bool(headers & _TAG_HEADERS)
    has_unit = bool(headers & _UNIT_HEADERS)

    if has_asset and has_signal and has_unit:
        return 0.90, signals + ["matched:signal_list"]
    if has_tag and has_unit and has_signal:
        return 0.80, signals + ["matched:signal_list"]
    if has_asset and has_tag:
        return 0.70, signals + ["matched:signal_list"]
    return 0.0, signals


def _score_register_map(headers: set[str]) -> tuple[float, list[str]]:
    signals = _header_signals(headers, _REGISTER_HEADERS)
    signals.extend(_header_signals(headers, _DATA_TYPE_HEADERS))
    signals.extend(_header_signals(headers, _TAG_HEADERS))
    signals.extend(_header_signals(headers, _SIGNAL_HEADERS))
    signals.extend(_header_signals(headers, _FUNCTION_CODE_HEADERS))
    signals.extend(_header_signals(headers, _SCALE_HEADERS))
    signals.extend(_header_signals(headers, _UNIT_HEADERS))

    has_register = bool(headers & _REGISTER_HEADERS)
    has_data_type = bool(headers & _DATA_TYPE_HEADERS)
    has_tag_signal = bool(headers & (_TAG_HEADERS | _SIGNAL_HEADERS))
    has_function_code = bool(headers & _FUNCTION_CODE_HEADERS)
    has_scale_unit = bool(headers & (_SCALE_HEADERS | _UNIT_HEADERS))

    if has_register and has_data_type and has_tag_signal:
        return 0.90, signals + ["matched:register_map"]
    if has_register and has_function_code:
        return 0.80, signals + ["matched:register_map"]
    if has_register and has_scale_unit:
        return 0.70, signals + ["matched:register_map"]
    return 0.0, signals


def _score_alarm_history(headers: set[str]) -> tuple[float, list[str]]:
    signals = _header_signals(headers, _TIMESTAMP_HEADERS)
    signals.extend(_header_signals(headers, _ALARM_HEADERS))
    signals.extend(_header_signals(headers, _SEVERITY_HEADERS))
    signals.extend(_header_signals(headers, _STATE_HEADERS))
    signals.extend(_header_signals(headers, _SOURCE_HEADERS))
    signals.extend(_header_signals(headers, _ACK_HEADERS))
    signals.extend(_header_signals(headers, _MESSAGE_HEADERS))

    has_timestamp = bool(headers & _TIMESTAMP_HEADERS)
    has_alarm = bool(headers & _ALARM_HEADERS)
    has_severity = bool(headers & _SEVERITY_HEADERS)
    has_state = bool(headers & _STATE_HEADERS)
    has_source = bool(headers & _SOURCE_HEADERS)
    has_message = bool(headers & _MESSAGE_HEADERS)

    if has_timestamp and has_alarm and has_severity:
        return 0.90, signals + ["matched:alarm_history"]
    if has_timestamp and has_source and has_state:
        return 0.80, signals + ["matched:alarm_history"]
    if has_alarm and has_severity and has_message:
        return 0.70, signals + ["matched:alarm_history"]
    return 0.0, signals


def _score_cause_effect_matrix(headers: set[str]) -> tuple[float, list[str]]:
    signals = _header_signals(headers, _CAUSE_HEADERS)
    signals.extend(_header_signals(headers, _EFFECT_HEADERS))
    signals.extend(_header_signals(headers, _ACTION_HEADERS))
    signals.extend(_header_signals(headers, _CONDITION_HEADERS))
    signals.extend(_header_signals(headers, _CONSEQUENCE_HEADERS))
    signals.extend(_header_signals(headers, _TARGET_HEADERS))

    has_cause = bool(headers & _CAUSE_HEADERS)
    has_effect = bool(headers & _EFFECT_HEADERS)
    has_action = bool(headers & _ACTION_HEADERS)
    has_condition = bool(headers & _CONDITION_HEADERS)
    has_consequence = bool(headers & _CONSEQUENCE_HEADERS)
    has_target = bool(headers & _TARGET_HEADERS)

    if has_cause and has_effect and has_action:
        return 0.90, signals + ["matched:cause_effect_matrix"]
    if has_condition and has_consequence and has_action:
        return 0.80, signals + ["matched:cause_effect_matrix"]
    if has_cause and has_target:
        return 0.70, signals + ["matched:cause_effect_matrix"]
    return 0.0, signals


def _score_operator_note_headers(headers: set[str]) -> tuple[float, list[str]]:
    note_headers = headers & _NOTE_HEADERS
    if not note_headers:
        return 0.0, []
    if len(headers) == 1 or headers <= _NOTE_HEADERS:
        signals = _header_signals(headers, _NOTE_HEADERS) + ["matched:operator_note"]
        return 0.80, signals
    return 0.0, _header_signals(headers, _NOTE_HEADERS)


def _score_operator_note_text(text: str) -> tuple[float, list[str]]:
    stripped = text.strip()
    if not stripped:
        return 0.0, []

    signals: list[str] = []
    if len(stripped) > 30 and not _looks_tabular(stripped):
        signals.append("text:prose")

    matched_terms = [term for term in _OPERATOR_TERMS if re.search(rf"\b{re.escape(term)}\b", stripped, re.I)]
    signals.extend(f"term:{term}" for term in matched_terms)

    if len(stripped) > 30 and matched_terms and "text:prose" in signals:
        return 0.80, signals + ["matched:operator_note"]
    if len(stripped) > 30 and "text:prose" in signals:
        return 0.60, signals + ["matched:operator_note"]
    return 0.0, signals


def _looks_tabular(text: str) -> bool:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if len(lines) < 2:
        return False
    for delimiter in (",", ";", "\t", "|"):
        counts = [line.count(delimiter) for line in lines[:5]]
        if all(count > 0 for count in counts) and len(set(counts)) == 1:
            return True
    return False