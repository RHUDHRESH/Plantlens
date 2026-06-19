"""Compiled bundle ORM model — compiler output, versioned and hashed."""

from datetime import datetime

from sqlalchemy import JSON, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPrimaryKeyMixin, utc_now


class CompiledBundle(Base, UUIDPrimaryKeyMixin):
    """Immutable compiled bundle snapshot produced by the Studio compiler."""

    __tablename__ = "compiled_bundle"

    plant_id: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    version: Mapped[str] = mapped_column(String(64), nullable=False)
    content_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    payload_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    compiled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )