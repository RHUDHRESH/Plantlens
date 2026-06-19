"""In-memory runtime singleton — live tags, alarms, situations, calm card."""

from __future__ import annotations

from datetime import datetime

from app.schemas.tag_frame import TagFrame


class RuntimeState:
    """Latest derived runtime state for the single-worker MVP."""

    def __init__(self) -> None:
        self.tags: dict[str, TagFrame] = {}
        self.active_alarms: dict[str, dict] = {}
        self.active_situations: dict[str, dict] = {}
        self.latest_calm_card: dict | None = None
        self.latest_evidence_packet: dict | None = None
        self.asset_status: dict[str, str] = {}
        self._seen_identity_keys: set[tuple[str, str, int | None, datetime]] = set()

    def update_tag(self, frame: TagFrame) -> bool:
        """Store latest frame; return False if duplicate identity key."""
        key = frame.identity_key()
        if key in self._seen_identity_keys:
            return False
        self._seen_identity_keys.add(key)
        self.tags[frame.tag_id] = frame
        return True

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


runtime_state = RuntimeState()