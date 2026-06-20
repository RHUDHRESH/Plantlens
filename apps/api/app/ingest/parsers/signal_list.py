"""Signal-list parser for offline authored-knowledge ingestion."""

from __future__ import annotations

from app.ingest.mapping.candidates import (
    build_ambiguous_signal_candidate,
    build_duplicate_tag_candidate,
    build_unknown_asset_candidate,
    build_unknown_tag_candidate,
)
from app.ingest.normalizers.asset import canonical_asset_id, normalize_asset_label
from app.ingest.normalizers.common import is_blank
from app.ingest.normalizers.tag import canonical_tag_id
from app.ingest.normalizers.unit import normalize_unit
from app.ingest.parsers.common import (
    average_confidence,
    build_fields_payload,
    close_tag_matches,
    first_field,
    infer_signal_type,
    make_record_id,
    normalize_side,
)
from uuid import uuid4

from app.schemas.ingest.mapping import MappingCandidate
from app.schemas.ingest.normalized import NormalizedRecord
from app.schemas.ingest.record import RawRecord

_ASSET_ALIASES = ("asset_label", "asset", "equipment", "equipment_label")
_SIGNAL_ALIASES = ("signal_label", "signal", "measurement", "point_name")
_TAG_HINT_ALIASES = ("tag_hint", "tag", "tag_id", "point_id")
_UNIT_ALIASES = ("unit", "engineering_unit", "eu")
_SIDE_ALIASES = ("side", "domain", "electrical_side")


def parse_signal_list_records(
    *,
    records: list[RawRecord],
    known_assets: dict[str, str] | None = None,
    known_tags: dict[str, str] | None = None,
) -> tuple[list[NormalizedRecord], list[MappingCandidate]]:
    """Parse signal-list raw rows into normalized tag candidates."""
    normalized: list[NormalizedRecord] = []
    mapping_candidates: list[MappingCandidate] = []
    seen_tags: dict[str, str] = {}

    for raw in records:
        asset_raw = first_field(raw.fields, _ASSET_ALIASES)
        signal_raw = first_field(raw.fields, _SIGNAL_ALIASES)
        tag_hint = first_field(raw.fields, _TAG_HINT_ALIASES)
        unit_raw = first_field(raw.fields, _UNIT_ALIASES)
        side_raw = first_field(raw.fields, _SIDE_ALIASES)

        asset_label_result = normalize_asset_label(asset_raw)
        asset_id_result = canonical_asset_id(asset_raw)
        unit_result = normalize_unit(unit_raw)
        tag_result = canonical_tag_id(
            asset_label=asset_raw,
            signal_label=signal_raw,
            tag_hint=tag_hint,
            unit=unit_result.value,
            side=normalize_side(side_raw),
        )

        warnings = list(raw.parser_warnings)
        warnings.extend(asset_id_result.warnings)
        warnings.extend(unit_result.warnings)
        warnings.extend(tag_result.warnings)
        notes = (
            asset_label_result.notes
            + asset_id_result.notes
            + unit_result.notes
            + tag_result.notes
        )

        record_id = make_record_id()

        if "unknown_asset_label" in asset_id_result.warnings and asset_raw:
            mapping_candidates.append(
                build_unknown_asset_candidate(
                    run_id=raw.run_id,
                    artifact_id=raw.artifact_id,
                    source_record_id=raw.raw_id,
                    raw_value=asset_raw,
                    source_ref=raw.source_ref,
                    known_assets=known_assets,
                )
            )

        if "fallback_tag_generated" in tag_result.warnings:
            raw_tag_value = tag_hint or signal_raw or tag_result.value or ""
            match_parts = [
                part
                for part in (asset_raw, signal_raw, tag_hint)
                if part is not None and not is_blank(part)
            ]
            match_value = " ".join(match_parts)
            close_matches = close_tag_matches(
                match_value,
                known_tags,
                signal_label=signal_raw,
            )
            if close_matches:
                mapping_candidates.append(
                    build_ambiguous_signal_candidate(
                        run_id=raw.run_id,
                        artifact_id=raw.artifact_id,
                        source_record_id=raw.raw_id,
                        raw_value=raw_tag_value,
                        source_ref=raw.source_ref,
                        suggested_matches=close_matches,
                    )
                )
            else:
                mapping_candidates.append(
                    build_unknown_tag_candidate(
                        run_id=raw.run_id,
                        artifact_id=raw.artifact_id,
                        source_record_id=raw.raw_id,
                        raw_value=raw_tag_value,
                        source_ref=raw.source_ref,
                        known_tags=known_tags,
                    )
                )

        if "missing_unit" in unit_result.warnings:
            mapping_candidates.append(
                MappingCandidate(
                    mapping_id=f"map_{uuid4()}",
                    run_id=raw.run_id,
                    artifact_id=raw.artifact_id,
                    source_record_id=raw.raw_id,
                    target_type="tag",
                    issue="UNKNOWN_TAG",
                    raw_value=tag_hint or signal_raw or "",
                    evidence=["missing_unit"],
                    source_ref=raw.source_ref,
                )
            )
            continue

        required_values = {
            "tag_id": tag_result.value,
            "asset_id": asset_id_result.value,
            "asset_label": asset_label_result.value or asset_raw,
            "signal_label": signal_raw,
            "unit": unit_result.value,
        }
        if any(is_blank(value) for value in required_values.values()):
            continue

        tag_id = tag_result.value
        assert tag_id is not None
        if tag_id in seen_tags:
            mapping_candidates.append(
                build_duplicate_tag_candidate(
                    run_id=raw.run_id,
                    artifact_id=raw.artifact_id,
                    source_record_id=raw.raw_id,
                    tag_id=tag_id,
                    source_ref=raw.source_ref,
                    conflicts=[seen_tags[tag_id]],
                )
            )
        else:
            seen_tags[tag_id] = raw.raw_id

        normalized.append(
            NormalizedRecord(
                record_id=record_id,
                run_id=raw.run_id,
                artifact_id=raw.artifact_id,
                raw_id=raw.raw_id,
                record_kind="tag_candidate",
                tag_id=tag_result.value,
                asset_id=asset_id_result.value,
                asset_label=required_values["asset_label"],
                signal_label=required_values["signal_label"],
                unit=unit_result.value,
                side=normalize_side(side_raw),
                signal_type=infer_signal_type(required_values["signal_label"], unit_result.value),
                fields=build_fields_payload(
                    raw_fields=raw.fields,
                    extra={
                        "tag_hint": tag_hint,
                        "normalization_confidence_parts": {
                            "asset": asset_id_result.confidence,
                            "unit": unit_result.confidence,
                            "tag": tag_result.confidence,
                        },
                    },
                ),
                source_ref=raw.source_ref,
                confidence=average_confidence(
                    asset_id_result.confidence,
                    unit_result.confidence,
                    tag_result.confidence,
                ),
                normalization_notes=notes,
                warnings=warnings,
            )
        )

    return normalized, mapping_candidates