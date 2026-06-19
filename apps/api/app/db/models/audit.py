"""Audit ledger ORM skeleton — hash-chain service deferred to later chunk."""

from datetime import datetime

from sqlalchemy import JSON, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPrimaryKeyMixin, utc_now


class AuditRecordRow(Base, UUIDPrimaryKeyMixin):
    """Append-only audit row skeleton (hash-chain logic not implemented yet)."""

    __tablename__ = "audit_record"

    audit_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    actor_type: Mapped[str] = mapped_column(String(32), nullable=False)
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    hash_prev: Mapped[str] = mapped_column(String(128), nullable=False)
    hash_self: Mapped[str] = mapped_column(String(128), nullable=False)
    payload_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)