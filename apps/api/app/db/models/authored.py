"""Authored plant/config ORM models — Studio source of truth, not runtime snapshots."""

from sqlalchemy import JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class AuthoredPlantBundle(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Versioned authored plant bundle metadata (forms/contracts source)."""

    __tablename__ = "authored_plant_bundle"

    plant_id: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    bundle_version: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)


class AuthoredConfigDocument(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Individual authored config document (plant, tag_map, alarm_rules, graph, etc.)."""

    __tablename__ = "authored_config_document"

    plant_id: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    doc_type: Mapped[str] = mapped_column(String(64), nullable=False)
    revision: Mapped[str] = mapped_column(String(64), nullable=False)
    payload_json: Mapped[dict] = mapped_column(JSON, nullable=False)