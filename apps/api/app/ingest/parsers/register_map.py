"""Register-map parser for offline authored-knowledge ingestion."""

from __future__ import annotations

from app.ingest.mapping.candidates import (
    build_duplicate_tag_candidate,
    build_unknown_asset_candidate,
    build_unknown_tag_candidate,
)
from app.ingest.normalizers.asset import canonical_asset_id, normalize_asset_label
from app.ingest.normalizers.common import is_blank, normalize_label
from app.ingest.normalizers.register import (
    normalize_data_type,
    normalize_function_code,
    normalize_register_address,
)
from app.ingest.normalizers.tag import canonical_tag_id, is_valid_tag_id
from app.ingest.normalizers.unit import normalize_unit
from app.ingest.parsers.common import (
    average_confidence,
    build_fields_payload,
    first_field,
    infer_signal_type,
    make_record_id,
    normalize_side,
)
from app.schemas.ingest.mapping import MappingCandidate
from app.schemas.ingest.normalized import NormalizedRecord
from app.schemas.ingest.record import RawRecord

_TAG_ALIASES = ("tag_id", "tag", "tag_hint", "signal", "point_id")
_ASSET_ALIASES = ("asset_label", "asset", "equipment", "equipment_label")
_REGISTER_ALIASES = ("register", "address", "register_address", "modbus_address", "offset")
_FUNCTION_CODE_ALIASES = ("function_code", "fc", "modbus_function")
_DATA_TYPE_ALIASES = ("data_type", "datatype", "type")
_SCALE_ALIASES = ("scale", "scaling", "multiplier")
_UNIT_ALIASES = ("unit", "engineering_unit", "eu")
_SIGNAL_ALIASES = ("signal_label", "signal", "description", "point_name")


def parse_register_map_records(
    *,
    records: list[RawRecord],
    known_assets: dict[str, str] | None = None,
    known_tags: dict[str, str] | None = None,
) -> tuple[list[NormalizedRecord], list[MappingCandidate]]:
    """Parse register-map raw rows into normalized register-map candidates."""
    del known_assets, known_tags  # reserved for future registry-aware suggestions

    normalized: list[NormalizedRecord] = []
    mapping_candidates: list[MappingCandidate] = []
    seen_tags: dict[str, str] = {}

    for raw in records:
        explicit_tag = first_field(raw.fields, _TAG_ALIASES)
        asset_raw = first_field(raw.fields, _ASSET_ALIASES)
        signal_raw = first_field(raw.fields, _SIGNAL_ALIASES)
        register_raw = first_field(raw.fields, _REGISTER_ALIASES)
        function_code_raw = first_field(raw.fields, _FUNCTION_CODE_ALIASES)
        data_type_raw = first_field(raw.fields, _DATA_TYPE_ALIASES)
        scale_raw = first_field(raw.fields, _SCALE_ALIASES)
        unit_raw = first_field(raw.fields, _UNIT_ALIASES)

        register_result = normalize_register_address(register_raw)
        function_code_result = normalize_function_code(function_code_raw)
        data_type_result = normalize_data_type(data_type_raw)
        asset_label_result = normalize_asset_label(asset_raw)
        asset_id_result = canonical_asset_id(asset_raw)
        unit_result = normalize_unit(unit_raw)

        tag_id: str | None = None
        tag_result_confidence = 0.0
        tag_notes: list[str] = []
        tag_warnings: list[str] = []

        if explicit_tag and is_valid_tag_id(explicit_tag.upper()):
            tag_id = explicit_tag.upper()
            tag_result_confidence = 1.0
            tag_notes.append("used_explicit_tag_id")
        elif explicit_tag and not is_valid_tag_id(explicit_tag):
            mapping_candidates.append(
                build_unknown_tag_candidate(
                    run_id=raw.run_id,
                    artifact_id=raw.artifact_id,
                    source_record_id=raw.raw_id,
                    raw_value=explicit_tag,
                    source_ref=raw.source_ref,
                )
            )
            tag_warnings.append("invalid_explicit_tag")
        else:
            tag_result = canonical_tag_id(
                asset_label=asset_raw,
                signal_label=signal_raw,
                tag_hint=explicit_tag,
                unit=unit_result.value,
            )
            tag_id = tag_result.value
            tag_result_confidence = tag_result.confidence
            tag_notes.extend(tag_result.notes)
            tag_warnings.extend(tag_result.warnings)
            if "fallback_tag_generated" in tag_result.warnings:
                mapping_candidates.append(
                    build_unknown_tag_candidate(
                        run_id=raw.run_id,
                        artifact_id=raw.artifact_id,
                        source_record_id=raw.raw_id,
                        raw_value=explicit_tag or signal_raw or tag_id or "",
                        source_ref=raw.source_ref,
                    )
                )

        warnings = list(raw.parser_warnings)
        warnings.extend(register_result.warnings)
        warnings.extend(function_code_result.warnings)
        warnings.extend(data_type_result.warnings)
        warnings.extend(asset_id_result.warnings)
        warnings.extend(unit_result.warnings)
        warnings.extend(tag_warnings)

        notes = (
            register_result.notes
            + function_code_result.notes
            + data_type_result.notes
            + asset_label_result.notes
            + asset_id_result.notes
            + unit_result.notes
            + tag_notes
        )

        if "unknown_asset_label" in asset_id_result.warnings and asset_raw:
            mapping_candidates.append(
                build_unknown_asset_candidate(
                    run_id=raw.run_id,
                    artifact_id=raw.artifact_id,
                    source_record_id=raw.raw_id,
                    raw_value=asset_raw,
                    source_ref=raw.source_ref,
                )
            )

        if is_blank(tag_id):
            continue

        resolved_tag_id = tag_id
        assert resolved_tag_id is not None
        if resolved_tag_id in seen_tags:
            mapping_candidates.append(
                build_duplicate_tag_candidate(
                    run_id=raw.run_id,
                    artifact_id=raw.artifact_id,
                    source_record_id=raw.raw_id,
                    tag_id=resolved_tag_id,
                    source_ref=raw.source_ref,
                    conflicts=[seen_tags[resolved_tag_id]],
                )
            )
        else:
            seen_tags[resolved_tag_id] = raw.raw_id

        confidence_parts = [
            register_result.confidence,
            function_code_result.confidence,
            data_type_result.confidence,
            asset_id_result.confidence,
            unit_result.confidence,
            tag_result_confidence,
        ]

        normalized.append(
            NormalizedRecord(
                record_id=make_record_id(),
                run_id=raw.run_id,
                artifact_id=raw.artifact_id,
                raw_id=raw.raw_id,
                record_kind="register_map_candidate",
                tag_id=tag_id,
                asset_id=asset_id_result.value,
                asset_label=asset_label_result.value or asset_raw,
                signal_label=normalize_label(signal_raw) or signal_raw,
                unit=unit_result.value,
                side=normalize_side(None),
                signal_type=infer_signal_type(signal_raw, unit_result.value),
                register={
                    "address": register_result.value,
                    "function_code": function_code_result.value,
                    "data_type": data_type_result.value,
                    "scale": scale_raw,
                },
                fields=build_fields_payload(
                    raw_fields=raw.fields,
                    extra={
                        "register_confidence_parts": {
                            "address": register_result.confidence,
                            "function_code": function_code_result.confidence,
                            "data_type": data_type_result.confidence,
                            "tag": tag_result_confidence,
                        }
                    },
                ),
                source_ref=raw.source_ref,
                confidence=average_confidence(*[value for value in confidence_parts if value > 0]),
                normalization_notes=notes,
                warnings=warnings,
            )
        )

    return normalized, mapping_candidates