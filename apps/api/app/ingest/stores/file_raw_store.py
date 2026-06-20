"""File-backed content-addressed raw artifact storage."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.schemas.ingest.artifact import RawArtifact, SourceChannel

from app.ingest.stores.base import (
    StoreIntegrityError,
    StoreNotFoundError,
    atomic_write_bytes,
    atomic_write_json,
    load_json,
    model_to_json,
    validate_model,
)


class FileRawArtifactStore:
    """Immutable raw bytes and artifact metadata on local disk."""

    def __init__(self, root_dir: str | Path) -> None:
        self._root = Path(root_dir)
        self._raw_dir = self._root / "raw"
        self._artifacts_dir = self._root / "artifacts"
        self._sha_index_path = self._artifacts_dir / "sha_index.json"

    def put_bytes(
        self,
        *,
        run_id: str,
        content: bytes,
        source_channel: SourceChannel,
        original_filename: str | None = None,
        mime_type: str | None = None,
        extension: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> RawArtifact:
        sha256 = hashlib.sha256(content).hexdigest()
        raw_path = self._raw_dir / sha256
        duplicate_of: str | None = None

        sha_index = self._load_sha_index()
        if sha256 in sha_index:
            duplicate_of = sha_index[sha256]
        elif not raw_path.exists():
            atomic_write_bytes(raw_path, content)

        artifact_id = f"art_{uuid4()}"
        raw_uri = str(raw_path.resolve())
        artifact = RawArtifact(
            artifact_id=artifact_id,
            run_id=run_id,
            received_at_utc=datetime.now(UTC),
            original_filename=original_filename,
            mime_type=mime_type,
            extension=extension,
            size_bytes=len(content),
            sha256=sha256,
            source_channel=source_channel,
            raw_uri=raw_uri,
            metadata=metadata or {},
            duplicate_of_artifact_id=duplicate_of,
        )

        atomic_write_json(self._artifacts_dir / f"{artifact_id}.json", model_to_json(artifact))

        if sha256 not in sha_index:
            sha_index[sha256] = artifact_id
            self._save_sha_index(sha_index)

        return artifact

    def get_bytes(self, artifact: RawArtifact) -> bytes:
        raw_path = Path(artifact.raw_uri)
        if not raw_path.exists():
            raise StoreNotFoundError(f"Raw bytes not found for artifact {artifact.artifact_id}")
        content = raw_path.read_bytes()
        digest = hashlib.sha256(content).hexdigest()
        if digest != artifact.sha256:
            raise StoreIntegrityError(
                f"SHA-256 mismatch for artifact {artifact.artifact_id}: "
                f"expected {artifact.sha256}, got {digest}"
            )
        return content

    def get_artifact(self, artifact_id: str) -> RawArtifact:
        path = self._artifacts_dir / f"{artifact_id}.json"
        data = load_json(path)
        model = validate_model(
            RawArtifact,
            data,
            context=f"artifact metadata {artifact_id}",
        )
        return model  # type: ignore[return-value]

    def artifact_exists_for_sha256(self, sha256: str) -> bool:
        return sha256 in self._load_sha_index() or (self._raw_dir / sha256).exists()

    def _load_sha_index(self) -> dict[str, str]:
        if not self._sha_index_path.exists():
            return {}
        data = load_json(self._sha_index_path)
        if not isinstance(data, dict):
            raise StoreIntegrityError("sha_index.json must be a JSON object")
        return {str(key): str(value) for key, value in data.items()}

    def _save_sha_index(self, sha_index: dict[str, str]) -> None:
        atomic_write_json(self._sha_index_path, dict(sorted(sha_index.items())))