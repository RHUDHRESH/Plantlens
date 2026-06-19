"""Immutable event ORM models — append-only telemetry and alarm history."""

from datetime import datetime

from sqlalchemy import JSON, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin, utc_now


class EventTagFrame(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    """Persisted TagFrame event (simulator or gateway), immutable."""

    __tablename__ = "event_tag_frame"

    plant_id: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    tag_id: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    asset_id: Mapped[str] = mapped_column(String(128), nullable=False)
    quality: Mapped[str] = mapped_column(String(32), nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    payload_json: Mapped[dict] = mapped_column(JSON, nullable=False)


class EventAlarm(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    """Immutable alarm raise/clear/ack event."""

    __tablename__ = "event_alarm"

    plant_id: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    alarm_id: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    tag_id: Mapped[str] = mapped_column(String(128), nullable=False)
    severity: Mapped[str] = mapped_column(String(32), nullable=False)
    state: Mapped[str] = mapped_column(String(32), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    payload_json: Mapped[dict] = mapped_column(JSON, nullable=False)