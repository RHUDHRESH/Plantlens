"""Byte-level line framer for text serial devices.

* Accumulates bytes until ``\\n`` (``\\r\\n`` accepted); never emits a partial line on a timeout.
* Caps the line length (default 512 bytes); on overflow the buffer is dropped and everything up
  to the next newline is discarded.
* Drops lines that are not valid UTF-8 or contain control bytes (anything < 0x20 except TAB,
  and DEL), e.g. line noise from a baud mismatch or boot loader garbage.
* After a (re)connect the caller can ask to discard up to the first newline, so a stream joined
  mid-line never yields a truncated first line.
"""

from __future__ import annotations

from dataclasses import dataclass

_ALLOWED_CONTROL = {0x09}


@dataclass(slots=True)
class FramerStats:
    lines: int = 0
    overflow_discards: int = 0
    invalid_utf8: int = 0
    control_bytes: int = 0
    partial_discards: int = 0

    def as_dict(self) -> dict[str, int]:
        return {k: getattr(self, k) for k in self.__slots__}  # type: ignore[attr-defined]


def _has_control(text: str) -> bool:
    return any((ord(ch) < 0x20 and ord(ch) not in _ALLOWED_CONTROL) or ord(ch) == 0x7F for ch in text)


class LineFramer:
    def __init__(self, max_line_bytes: int = 512) -> None:
        if max_line_bytes < 8:
            raise ValueError("max_line_bytes must be >= 8")
        self.max_line_bytes = max_line_bytes
        self._buf = bytearray()
        self._discarding = False
        self.stats = FramerStats()

    @property
    def pending(self) -> int:
        return len(self._buf)

    def reset(self, *, discard_until_newline: bool = False) -> None:
        """Forget any partial line (e.g. after a reconnect)."""
        if self._buf:
            self.stats.partial_discards += 1
        self._buf.clear()
        self._discarding = discard_until_newline

    def feed(self, data: bytes) -> list[str]:
        out: list[str] = []
        start = 0
        n = len(data)
        while start < n:
            nl = data.find(b"\n", start)
            if nl == -1:
                self._append(data[start:])
                break
            self._append(data[start:nl])
            line = self._take_line()
            if line is not None:
                out.append(line)
            start = nl + 1
        return out

    def _append(self, chunk: bytes) -> None:
        if self._discarding or not chunk:
            return
        if len(self._buf) + len(chunk) > self.max_line_bytes:
            self._buf.clear()
            self._discarding = True
            self.stats.overflow_discards += 1
            return
        self._buf += chunk

    def _take_line(self) -> str | None:
        if self._discarding:
            self._discarding = False
            self._buf.clear()
            return None
        raw = bytes(self._buf)
        self._buf.clear()
        if raw.endswith(b"\r"):
            raw = raw[:-1]
        if not raw:
            return None
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            self.stats.invalid_utf8 += 1
            return None
        if _has_control(text):
            self.stats.control_bytes += 1
            return None
        text = text.strip(" ")
        if not text:
            return None
        self.stats.lines += 1
        return text
