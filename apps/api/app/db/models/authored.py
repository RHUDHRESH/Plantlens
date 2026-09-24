"""Authored plant/config ORM models — Studio source of truth, not runtime snapshots."""

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Integer, String, Text
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

class BundleRevision(Base, TimestampMixin):
    """Immutable, numbered snapshot of the authored bundle the runtime can run.

    Revisions are append-only: an approved change produces revision N+1 and a rollback
    re-deploys an old snapshot as a new revision, so history is never rewritten.
    """

    __tablename__ = "authored_bundle_revision"

    rev: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    plant_id: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    parent_rev: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bundle_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    bundle_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    source_change_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    deployed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deployed_by: Mapped[str | None] = mapped_column(String(128), nullable=True)


class ChangeRequest(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """A proposed ChangeSet awaiting (or past) human engineering review (R5)."""

    __tablename__ = "authored_change_request"

    plant_id: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    source_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    created_by_role: Mapped[str] = mapped_column(String(32), nullable=False)
    base_rev: Mapped[int] = mapped_column(Integer, nullable=False)
    change_set_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    preview_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    reviewed_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    approve_edges: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    result_rev: Mapped[int | None] = mapped_column(Integer, nullable=True)
