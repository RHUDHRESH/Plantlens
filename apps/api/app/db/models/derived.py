"""Derived runtime snapshot ORM models — recomputed state, never authored config."""

from datetime import datetime

from sqlalchemy import JSON, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPrimaryKeyMixin, utc_now


class DerivedSituationSnapshot(Base, UUIDPrimaryKeyMixin):
    """Derived Situation snapshot for replay/audit (not authored config)."""

    __tablename__ = "derived_situation_snapshot"

    plant_id: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    situation_id: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    situation_type: Mapped[str] = mapped_column(String(128), nullable=False)
    severity: Mapped[str] = mapped_column(String(32), nullable=False)
    payload_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    derived_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )


class DerivedCalmCardSnapshot(Base, UUIDPrimaryKeyMixin):
    """Derived Calm Card snapshot (structured decision output, not authored)."""

    __tablename__ = "derived_calm_card_snapshot"

    plant_id: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    situation_id: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    card_id: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    payload_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    derived_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )