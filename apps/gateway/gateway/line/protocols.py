"""Line protocol parsers: PL1 (checksummed), header-driven CSV, legacy key=value, JSON.

Every public entry point is total: :meth:`LineDecoder.decode` never raises. A bad line is
rejected and counted in :class:`LineStats` (by reason); it never tears down the serial link.

PL1 wire format (one sample set per line)::

    PL1,<seq>,<key>=<value>[~Q],<key>=<value>[~Q]...*HH\\n

* ``seq``  unsigned decimal, +1 per line, wraps at 2**32. Gaps are counted as lost lines; a
  backwards jump (device reset) is counted as a restart.
* ``HH``   CRC-8, polynomial 0x07, init 0x00, no reflection, no final XOR (CRC-8/SMBUS),
  as two hex digits, computed over every byte from the ``P`` of ``PL1`` up to, not including,
  the ``*``. Check value: ``crc8(b"123456789") == 0xF4``.
* ``value`` decimal float with optional exponent (``1e3``), ``true``/``false``, or
  ``nan``/``inf``/``null`` (published as quality BAD with value null, never GOOD).
* ``~Q`` optional quality suffix set by firmware: ``~B`` BAD, ``~U`` UNCERTAIN, ``~G`` GOOD.
* Lines starting with ``#`` are comments/banners and are ignored.
"""

from __future__ import annotations

import json
import math
import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Literal

ReadingQuality = Literal["GOOD", "UNCERTAIN", "BAD", "STALE"]
Protocol = Literal["auto", "pl1", "csv", "kv", "json"]

_FLOAT_RE = re.compile(r"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$")
_DECIMAL_COMMA_RE = re.compile(r"^[+-]?\d+,\d+$")
_KEY_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_.\-]*$")
_KV_TOKEN_RE = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_.\-]*)\s*[:=]\s*(\S(?:.*\S)?)\s*$")
_TAG_ID_RE = re.compile(r"^[A-Z0-9_]+$")
_SEPARATORS = (",", ";", "\t")
_SEQ_COLUMNS = {"seq", "sequence", "n"}
_QUALITY_COLUMNS = {"quality", "q"}
_IGNORED_COLUMNS = {"timestamp", "timestamp_us", "timestamp_ms", "time", "time_ms", "t_ms", "millis", "micros", "ts"}
_SUFFIX_QUALITY: dict[str, ReadingQuality] = {"B": "BAD", "U": "UNCERTAIN", "G": "GOOD"}
_UNKNOWN_KEY_LIMIT = 64


@dataclass(frozen=True, slots=True)
class LineTagSpec:
    tag_id: str
    asset_id: str
    unit: str
    stale_after_ms: int = 2000


@dataclass(frozen=True, slots=True)
class Reading:
    tag_id: str
    value: float | bool | str | None
    quality: ReadingQuality


@dataclass(slots=True)
class LineStats:
    accepted_lines: int = 0
    readings: int = 0
    comments: int = 0
    non_finite: int = 0
    checksum_failures: int = 0
    seq_gaps: int = 0
    seq_restarts: int = 0
    header_changes: int = 0
    rejected: Counter[str] = field(default_factory=Counter)
    unknown_keys: Counter[str] = field(default_factory=Counter)

    @property
    def rejected_lines(self) -> int:
        return sum(self.rejected.values())

    def reject(self, reason: str) -> list[Reading]:
        self.rejected[reason] += 1
        return []

    def unknown(self, key: str) -> None:
        if key in self.unknown_keys or len(self.unknown_keys) < _UNKNOWN_KEY_LIMIT:
            self.unknown_keys[key] += 1
        else:
            self.unknown_keys["<other>"] += 1

    def as_dict(self) -> dict[str, Any]:
        return {
            "accepted_lines": self.accepted_lines,
            "rejected_lines": self.rejected_lines,
            "readings": self.readings,
            "comments": self.comments,
            "non_finite": self.non_finite,
            "checksum_failures": self.checksum_failures,
            "seq_gaps": self.seq_gaps,
            "seq_restarts": self.seq_restarts,
            "header_changes": self.header_changes,
            "rejected": dict(self.rejected),
            "unknown_keys": dict(self.unknown_keys),
        }


def crc8(data: bytes) -> int:
    """CRC-8/SMBUS: poly 0x07, init 0x00, no reflection, no xorout."""
    crc = 0
    for byte in data:
        crc ^= byte
        for _ in range(8):
            crc = ((crc << 1) ^ 0x07) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


def build_pl1(seq: int, pairs: list[tuple[str, str]] | dict[str, Any]) -> str:
    """Build a PL1 line (without trailing newline). Used by tests, tools and docs."""
    items = pairs.items() if isinstance(pairs, dict) else pairs
    body = "PL1," + str(seq & 0xFFFFFFFF) + "".join(f",{k}={v}" for k, v in items)
    return f"{body}*{crc8(body.encode('ascii')):02X}"


class ValueParseError(ValueError):
    pass


def parse_scalar(raw: str, *, decimal_comma: bool = False) -> tuple[float | bool | None, ReadingQuality]:
    """Parse a text value. Non-finite / null -> (None, BAD). Raises ValueParseError."""
    text = raw.strip()
    quality: ReadingQuality = "GOOD"
    if len(text) > 2 and text[-2] == "~" and text[-1].upper() in _SUFFIX_QUALITY:
        quality = _SUFFIX_QUALITY[text[-1].upper()]
        text = text[:-2].strip()
    lower = text.lower()
    if lower in {"true", "false"}:
        return lower == "true", quality
    if lower in {"nan", "+nan", "-nan", "inf", "+inf", "-inf", "infinity", "+infinity", "-infinity", "null", "none"}:
        return None, "BAD"
    if decimal_comma and _DECIMAL_COMMA_RE.match(text):
        text = text.replace(",", ".")
    if not _FLOAT_RE.match(text):
        raise ValueParseError(f"not a number: {raw[:32]!r}")
    value = float(text)
    if not math.isfinite(value):  # e.g. 1e999
        return None, "BAD"
    return value, quality


class _SeqTracker:
    def __init__(self, stats: LineStats) -> None:
        self._stats = stats
        self.last: int | None = None

    def observe(self, seq: int) -> None:
        if self.last is not None:
            expected = (self.last + 1) & 0xFFFFFFFF
            diff = (seq - expected) & 0xFFFFFFFF
            if diff:
                if diff < 0x80000000 and seq != 0:
                    self._stats.seq_gaps += diff
                else:
                    self._stats.seq_restarts += 1
        self.last = seq


class LineDecoder:
    """Stateful decoder (CSV header, PL1 sequence) for one serial stream."""

    def __init__(
        self,
        tag_index: dict[str, LineTagSpec],
        *,
        protocol: Protocol = "auto",
        column_map: dict[str, str] | None = None,
        default_tag_id: str | None = None,
        csv_header: str | None = None,
    ) -> None:
        self.tag_index = tag_index
        self.protocol = protocol
        self.column_map = dict(column_map or {})
        self._column_map_ci = {k.lower(): v for k, v in self.column_map.items()}
        self.default_tag_id = default_tag_id if default_tag_id in tag_index else None
        self.stats = LineStats()
        self._seq = _SeqTracker(self.stats)
        self._header: list[str] | None = None
        self._sep: str | None = None
        if csv_header:
            self._set_header(csv_header, count_change=False)

    # ------------------------------------------------------------------ helpers
    @property
    def csv_header(self) -> list[str] | None:
        return list(self._header) if self._header else None

    def reset_stream(self) -> None:
        """Called after a reconnect: the device may have reset, so seq restarts are expected."""
        self._seq.last = None

    def resolve_key(self, key: str) -> str | None:
        mapped = self.column_map.get(key) or self._column_map_ci.get(key.lower())
        if mapped is not None:
            return mapped if mapped in self.tag_index else None
        upper = key.upper()
        if _TAG_ID_RE.match(upper) and upper in self.tag_index:
            return upper
        return None

    def _accept(self, readings: list[Reading], reason_if_empty: str) -> list[Reading]:
        if not readings:
            return self.stats.reject(reason_if_empty)
        self.stats.accepted_lines += 1
        self.stats.readings += len(readings)
        self.stats.non_finite += sum(1 for r in readings if r.value is None)
        return readings

    @staticmethod
    def _detect_separator(line: str) -> str | None:
        counts = {sep: line.count(sep) for sep in _SEPARATORS}
        sep, n = max(counts.items(), key=lambda kv: kv[1])
        return sep if n > 0 else None

    def _looks_like_header(self, line: str) -> bool:
        sep = self._detect_separator(line)
        if sep is None:
            return False
        fields = [f.strip() for f in line.split(sep)]
        return len(fields) >= 2 and all(_KEY_RE.match(f) for f in fields) and not any(
            f.lower() in {"true", "false", "nan", "inf", "null"} for f in fields
        )

    def _set_header(self, line: str, *, count_change: bool = True) -> None:
        sep = self._detect_separator(line) or ","
        fields = [f.strip() for f in line.split(sep)]
        if self._header is not None and fields == self._header and sep == self._sep:
            return
        if count_change and self._header is not None:
            self.stats.header_changes += 1
        self._header, self._sep = fields, sep

    # ------------------------------------------------------------------ parsers
    def decode(self, line: str) -> list[Reading]:
        try:
            return self._decode(line.strip())
        except Exception:  # defensive: a parser bug must never kill the link
            return self.stats.reject("internal_error")

    def _decode(self, text: str) -> list[Reading]:
        if not text:
            return []
        if text.startswith("#"):
            self.stats.comments += 1
            return []
        proto = self.protocol
        if proto == "pl1" or (proto == "auto" and text.startswith("PL1,")):
            return self._decode_pl1(text)
        if proto == "json" or (proto == "auto" and text.startswith("{")):
            return self._decode_json(text)
        if proto == "csv":
            return self._decode_csv(text)
        if proto == "kv":
            return self._decode_kv(text)
        # auto
        if text.startswith("["):
            return self.stats.reject("json_not_object")
        if self._header is not None and self._sep in text and "=" not in text:
            if self._looks_like_header(text):
                self._set_header(text)
                return []
            return self._decode_csv(text)
        if self._looks_like_header(text):
            self._set_header(text)
            return []
        if "=" in text or ":" in text:
            return self._decode_kv(text)
        return self._decode_legacy_pair_or_bare(text)

    def _decode_pl1(self, text: str) -> list[Reading]:
        if not text.startswith("PL1,"):
            return self.stats.reject("pl1_bad_prefix")
        body, star, checksum = text.rpartition("*")
        if not star or len(checksum) != 2:
            return self.stats.reject("pl1_no_checksum")
        try:
            wire = int(checksum, 16)
        except ValueError:
            return self.stats.reject("pl1_no_checksum")
        try:
            expected = crc8(body.encode("ascii"))
        except UnicodeEncodeError:
            return self.stats.reject("pl1_non_ascii")
        if wire != expected:
            self.stats.checksum_failures += 1
            return self.stats.reject("pl1_checksum")
        parts = body.split(",")
        if len(parts) < 3:
            return self.stats.reject("pl1_empty")
        seq_text = parts[1].strip()
        if not seq_text.isdigit() or int(seq_text) > 0xFFFFFFFF:
            return self.stats.reject("pl1_bad_seq")
        self._seq.observe(int(seq_text))
        readings: list[Reading] = []
        for part in parts[2:]:
            key, eq, raw = part.partition("=")
            if not eq or not _KEY_RE.match(key.strip()):
                self.stats.rejected["pl1_bad_pair"] += 1
                continue
            reading = self._reading(key.strip(), raw)
            if reading is not None:
                readings.append(reading)
        return self._accept(readings, "pl1_no_known_keys")

    def _reading(self, key: str, raw: str, *, decimal_comma: bool = False) -> Reading | None:
        tag_id = self.resolve_key(key)
        if tag_id is None:
            self.stats.unknown(key)
            return None
        try:
            value, quality = parse_scalar(raw, decimal_comma=decimal_comma)
        except ValueParseError:
            self.stats.rejected["bad_value"] += 1
            return None
        return Reading(tag_id, value, quality)

    def _decode_csv(self, text: str) -> list[Reading]:
        if self._header is None:
            if self._looks_like_header(text):
                self._set_header(text)
                return []
            return self.stats.reject("csv_no_header")
        sep = self._sep or ","
        fields = [f.strip() for f in text.split(sep)]
        if len(fields) != len(self._header):
            return self.stats.reject("csv_width")
        row_quality: ReadingQuality | None = None
        pending: list[tuple[str, str]] = []
        for name, raw in zip(self._header, fields, strict=True):
            low = name.lower()
            if low in _SEQ_COLUMNS:
                if raw.isdigit():
                    self._seq.observe(int(raw) & 0xFFFFFFFF)
                continue
            if low in _QUALITY_COLUMNS:
                q = raw.upper()
                row_quality = "GOOD" if q == "GOOD" else "UNCERTAIN" if q == "UNCERTAIN" else "BAD"
                continue
            if low in _IGNORED_COLUMNS:
                continue
            pending.append((name, raw))
        readings: list[Reading] = []
        for name, raw in pending:
            tag_id = self.resolve_key(name)
            if tag_id is None:
                continue  # unmapped column: ignored by design (see README "CSV mapping")
            try:
                value, quality = parse_scalar(raw, decimal_comma=sep != ",")
            except ValueParseError:
                self.stats.rejected["bad_value"] += 1
                continue
            if row_quality is not None and row_quality != "GOOD" and value is not None:
                quality = row_quality
            readings.append(Reading(tag_id, value, quality))
        return self._accept(readings, "csv_no_mapped_columns")

    def _decode_kv(self, text: str) -> list[Reading]:
        readings: list[Reading] = []
        for token in re.split(r"[,;\t]", text):
            if not token.strip():
                continue
            match = _KV_TOKEN_RE.match(token)
            if not match:
                self.stats.rejected["kv_bad_token"] += 1
                continue
            reading = self._reading(match.group(1), match.group(2))
            if reading is not None:
                readings.append(reading)
        return self._accept(readings, "kv_no_known_keys")

    def _decode_legacy_pair_or_bare(self, text: str) -> list[Reading]:
        parts = [p.strip() for p in text.split(",")]
        if len(parts) == 2 and _KEY_RE.match(parts[0]):
            reading = self._reading(parts[0], parts[1])
            return self._accept([reading] if reading else [], "kv_no_known_keys")
        if len(parts) == 1:
            if self.default_tag_id is None:
                return self.stats.reject("bare_value_without_default_tag")
            try:
                value, quality = parse_scalar(parts[0])
            except ValueParseError:
                return self.stats.reject("unrecognized")
            return self._accept([Reading(self.default_tag_id, value, quality)], "unrecognized")
        return self.stats.reject("unrecognized")

    def _json_value(self, tag_id: str, value: Any, quality: Any = None) -> Reading | None:
        q: ReadingQuality = "GOOD"
        if isinstance(quality, str) and quality.upper() in {"BAD", "UNCERTAIN", "STALE", "MISSING"}:
            q = "UNCERTAIN" if quality.upper() == "UNCERTAIN" else "BAD"
        if value is None:
            return Reading(tag_id, None, "BAD")
        if isinstance(value, bool):
            return Reading(tag_id, value, q)
        if isinstance(value, (int, float)):
            f = float(value)
            if not math.isfinite(f):
                return Reading(tag_id, None, "BAD")
            return Reading(tag_id, f, q)
        if isinstance(value, str):
            try:
                v, pq = parse_scalar(value)
            except ValueParseError:
                if len(value) > 128:
                    self.stats.rejected["bad_value"] += 1
                    return None
                return Reading(tag_id, value, q)
            return Reading(tag_id, v, pq if q == "GOOD" else q)
        self.stats.rejected["bad_value"] += 1
        return None

    def _decode_json(self, text: str) -> list[Reading]:
        try:
            obj = json.loads(text)
        except (ValueError, RecursionError):
            return self.stats.reject("json_invalid")
        if not isinstance(obj, dict):
            return self.stats.reject("json_not_object")
        readings: list[Reading] = []
        tag_key = "tag" if "tag" in obj else "tag_id" if "tag_id" in obj else None
        if tag_key is not None and "value" in obj:
            raw_tag = obj[tag_key]
            if not isinstance(raw_tag, str):
                return self.stats.reject("json_bad_tag")
            tag_id = self.resolve_key(raw_tag)
            if tag_id is None:
                self.stats.unknown(raw_tag)
                return self.stats.reject("json_unknown_tag")
            reading = self._json_value(tag_id, obj["value"], obj.get("quality"))
            return self._accept([reading] if reading else [], "json_bad_value")
        for key, value in obj.items():
            if not isinstance(key, str):
                continue
            tag_id = self.resolve_key(key)
            if tag_id is None:
                self.stats.unknown(key)
                continue
            reading = self._json_value(tag_id, value)
            if reading is not None:
                readings.append(reading)
        return self._accept(readings, "json_no_known_keys")
