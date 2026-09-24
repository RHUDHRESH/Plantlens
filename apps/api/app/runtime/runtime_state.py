"""In-memory runtime singleton — live tags, alarms, situations, calm card."""

from __future__ import annotations

import time
from collections import OrderedDict, deque
from datetime import datetime, timedelta

from app.schemas.tag_frame import TagFrame


# Bounded replay-dedupe window; a long-running gateway must not grow memory without limit.
MAX_DEDUPE_KEYS = 50_000
# Per-tag trend ring buffer (e.g. 1 h at 2 Hz). Long-term history belongs in a historian.
TREND_POINTS_PER_TAG = 7_200


class RuntimeState:
    """Latest derived runtime state for the single-worker MVP."""

    def __init__(self) -> None:
        self.tags: dict[str, TagFrame] = {}
        self.active_alarms: dict[str, dict] = {}
        self.active_situations: dict[str, dict] = {}
        self.latest_calm_card: dict | None = None
        self.latest_evidence_packet: dict | None = None
        self.asset_status: dict[str, str] = {}
        self._seen_identity_keys: OrderedDict[tuple[str, str, int | None, datetime], None] = (
            OrderedDict()
        )
        # Runtime clock: the evaluation instant of the latest frame plus monotonic time since.
        # Simulator frames anchor scenario time; gateway frames anchor server wall time.
        self._clock_anchor: tuple[datetime, float] | None = None
        self.history: dict[str, deque[tuple[str, float | None, str]]] = {}

    def anchor_clock(self, now: datetime) -> None:
        self._clock_anchor = (now, time.monotonic())

    def clock_now(self) -> datetime | None:
        """Current runtime instant, or None before the first frame."""
        if self._clock_anchor is None:
            return None
        anchor, mono = self._clock_anchor
        return anchor + timedelta(seconds=time.monotonic() - mono)

    def update_tag(self, frame: TagFrame) -> bool:
        """Store latest frame; return False if duplicate identity key."""
        key = frame.identity_key()
        if key in self._seen_identity_keys:
            return False
        self._seen_identity_keys[key] = None
        if len(self._seen_identity_keys) > MAX_DEDUPE_KEYS:
            self._seen_identity_keys.popitem(last=False)
        self.tags[frame.tag_id] = frame
        self._record_history(frame)
        return True

    def _record_history(self, frame: TagFrame) -> None:
        value = frame.value
        numeric = float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else (
            1.0 if value is True else 0.0 if value is False else None
        )
        ring = self.history.get(frame.tag_id)
        if ring is None:
            ring = self.history[frame.tag_id] = deque(maxlen=TREND_POINTS_PER_TAG)
        ring.append((frame.timestamp.isoformat().replace("+00:00", "Z"), numeric, frame.quality))

    def tag_history(self, tag_id: str, *, since: datetime | None = None) -> list[tuple[str, float | None, str]]:
        ring = self.history.get(tag_id)
        if not ring:
            return []
        if since is None:
            return list(ring)
        cutoff = since.isoformat().replace("+00:00", "Z")
        return [point for point in ring if point[0] >= cutoff]

    def get_tag_value(self, tag_id: str):
        frame = self.tags.get(tag_id)
        return None if frame is None else frame.value

    def get_tag(self, tag_id: str) -> TagFrame | None:
        return self.tags.get(tag_id)

    def refresh_tag(self, frame: TagFrame) -> None:
        """Overwrite the latest frame for a tag (quality refresh without dedupe)."""
        self.tags[frame.tag_id] = frame

    def is_stale(self, tag_id: str, now: datetime, *, stale_after_ms: int = 1500) -> bool:
        frame = self.tags.get(tag_id)
        if frame is None:
            return True
        if frame.quality in {"STALE", "MISSING", "BAD"}:
            return True
        age_ms = (now - frame.timestamp).total_seconds() * 1000
        return age_ms > stale_after_ms

    def snapshot(self) -> dict:
        return {
            "tags": {
                tag_id: frame.model_dump(mode="json")
                for tag_id, frame in self.tags.items()
            },
            "active_alarms": list(self.active_alarms.values()),
            "active_situations": list(self.active_situations.values()),
            "latest_calm_card": self.latest_calm_card,
            "latest_evidence_packet": self.latest_evidence_packet,
            "asset_status": dict(self.asset_status),
        }

    def reset(self) -> None:
        self.tags.clear()
        self.active_alarms.clear()
        self.active_situations.clear()
        self.latest_calm_card = None
        self.latest_evidence_packet = None
        self.asset_status.clear()
        self._seen_identity_keys.clear()
        self._clock_anchor = None
        self.history.clear()


runtime_state = RuntimeState()