"""Mapping candidate builders for offline ingestion review queues."""

from __future__ import annotations

from uuid import uuid4

from app.ingest.mapping.similarity import simple_similarity
from app.schemas.ingest.mapping import MappingCandidate, SuggestedMatch
from app.schemas.ingest.record import SourceRef


def _make_mapping_id() -> str:
    return f"map_{uuid4()}"


def _rank_registry_matches(
    raw_value: str,
    registry: dict[str, str] | None,
    *,
    evidence_prefix: str,
) -> list[SuggestedMatch]:
    if not registry:
        return []
    matches = [
        SuggestedMatch(
            target_id=target_id,
            label=label,
            confidence=simple_similarity(raw_value, label),
            evidence=[f"{evidence_prefix}:{target_id}"],
        )
        for target_id, label in registry.items()
    ]
    matches.sort(key=lambda match: match.confidence, reverse=True)
    return matches


def build_unknown_asset_candidate(
    *,
    run_id: str,
    artifact_id: str,
    source_record_id: str,
    raw_value: str,
    source_ref: SourceRef,
    known_assets: dict[str, str] | None = None,
) -> MappingCandidate:
    """Queue an unknown asset label for human resolution."""
    return MappingCandidate(
        mapping_id=_make_mapping_id(),
        run_id=run_id,
        artifact_id=artifact_id,
        source_record_id=source_record_id,
        target_type="asset",
        issue="UNKNOWN_ASSET",
        raw_value=raw_value,
        suggested_matches=_rank_registry_matches(
            raw_value,
            known_assets,
            evidence_prefix="known_asset",
        ),
        evidence=["unknown_asset_label"],
        source_ref=source_ref,
    )


def build_unknown_tag_candidate(
    *,
    run_id: str,
    artifact_id: str,
    source_record_id: str,
    raw_value: str,
    source_ref: SourceRef,
    known_tags: dict[str, str] | None = None,
) -> MappingCandidate:
    """Queue an unknown tag hint for human resolution."""
    return MappingCandidate(
        mapping_id=_make_mapping_id(),
        run_id=run_id,
        artifact_id=artifact_id,
        source_record_id=source_record_id,
        target_type="tag",
        issue="UNKNOWN_TAG",
        raw_value=raw_value,
        suggested_matches=_rank_registry_matches(
            raw_value,
            known_tags,
            evidence_prefix="known_tag",
        ),
        evidence=["unknown_tag_hint"],
        source_ref=source_ref,
    )


def build_duplicate_tag_candidate(
    *,
    run_id: str,
    artifact_id: str,
    source_record_id: str,
    tag_id: str,
    source_ref: SourceRef,
    conflicts: list[str],
) -> MappingCandidate:
    """Queue a duplicate tag collision for human resolution."""
    return MappingCandidate(
        mapping_id=_make_mapping_id(),
        run_id=run_id,
        artifact_id=artifact_id,
        source_record_id=source_record_id,
        target_type="tag",
        issue="DUPLICATE_TAG",
        raw_value=tag_id,
        evidence=["duplicate_tag"],
        conflicts=conflicts,
        source_ref=source_ref,
    )


def build_ambiguous_signal_candidate(
    *,
    run_id: str,
    artifact_id: str,
    source_record_id: str,
    raw_value: str,
    source_ref: SourceRef,
    suggested_matches: list[SuggestedMatch] | None = None,
) -> MappingCandidate:
    """Queue an ambiguous signal/tag mapping for human resolution."""
    return MappingCandidate(
        mapping_id=_make_mapping_id(),
        run_id=run_id,
        artifact_id=artifact_id,
        source_record_id=source_record_id,
        target_type="tag",
        issue="AMBIGUOUS_SIGNAL",
        raw_value=raw_value,
        suggested_matches=suggested_matches or [],
        evidence=["ambiguous_signal"],
        source_ref=source_ref,
    )