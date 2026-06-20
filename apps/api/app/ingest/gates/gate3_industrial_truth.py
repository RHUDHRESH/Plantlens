"""Gate 3 — industrial truth sanity checks for normalized offline ingestion records."""

from __future__ import annotations

from app.ingest.quarantine import quarantine_from_gate_issue, quarantine_from_mapping_candidate
from app.schemas.ingest.gates import GateIssue, GateReport, GateVerdict
from app.schemas.ingest.mapping import MappingCandidate
from app.schemas.ingest.normalized import NormalizedRecord
from app.schemas.ingest.quarantine import QuarantineReason, QuarantineRecord

_VALID_FUNCTION_CODES = frozenset({"1", "2", "3", "4", "5", "6", "15", "16"})
_VALID_DATA_TYPES = frozenset({"int16", "uint16", "int32", "uint32", "float32", "bool"})
_ANALOG_UNITS = frozenset({"V", "kV", "mV", "A", "mA", "W", "kW"})

_EXPECTED_SIDES: dict[str, str] = {
    "CHG_SOLAR_OUT_V": "dc",
    "CHG_SOLAR_OUT_I": "dc",
    "CHG_SOLAR_OUT_P": "dc",
    "CHG_MAINS_OUT_V": "dc",
    "CHG_MAINS_OUT_I": "dc",
    "CHG_MAINS_OUT_P": "dc",
    "BAT_24V_V": "dc",
    "BAT_24V_I": "dc",
    "BAT_24V_P": "dc",
    "INV_AC_OUT_V": "ac",
    "INV_AC_OUT_I": "ac",
    "INV_AC_OUT_P": "ac",
    "VFD_OUT_V": "ac",
    "VFD_OUT_I": "ac",
    "VFD_OUT_P": "ac",
    "MTR_FHP_SPEED": "mechanical",
    "MTR_FHP_VIB": "mechanical",
    "MTR_FHP_TEMP": "thermal",
}

_SIGNAL_UNITS: dict[str, frozenset[str | None]] = {
    "voltage": frozenset({"V", "kV", "mV"}),
    "current": frozenset({"A", "mA"}),
    "power": frozenset({"W", "kW"}),
    "speed": frozenset({"rpm"}),
    "vibration": frozenset({"mm/s"}),
    "temperature": frozenset({"degC", "degF"}),
    "state": frozenset({"bool", None, ""}),
}

_IMPOSSIBLE_UNIT_SIGNAL: list[tuple[str, frozenset[str]]] = [
    ("vibration", frozenset({"V", "kV", "mV"})),
    ("temperature", frozenset({"A", "mA"})),
    ("voltage", frozenset({"rpm"})),
    ("current", frozenset({"degC", "degF"})),
    ("power", frozenset({"mm/s"})),
]


def run_gate3_industrial_truth(
    *,
    records: list[NormalizedRecord],
    mapping_candidates: list[MappingCandidate] | None = None,
) -> tuple[GateReport, list[QuarantineRecord], list[NormalizedRecord]]:
    """Validate industrial plausibility and mapping-review conditions."""
    candidates = mapping_candidates or []
    if not records and not candidates:
        report = GateReport(
            gate_name="industrial_truth",
            verdict="skipped",
            accepted=0,
            rejected=0,
            issues=[],
        )
        return report, [], []

    issues: list[GateIssue] = []
    quarantine: list[QuarantineRecord] = []
    rejected_ids: set[str] = set()

    for candidate in candidates:
        if not candidate.needs_human_review:
            continue
        issues.append(
            _issue(
                "MANUAL_REVIEW_REQUIRED",
                f"Mapping candidate requires human review: {candidate.issue}",
                "MEDIUM",
                candidate.source_ref,
                fix=_mapping_fix(candidate.issue),
            )
        )
        quarantine.append(quarantine_from_mapping_candidate(candidate))

    seen_tags: dict[str, str] = {}
    for record in records:
        record_issues = _check_record(record, seen_tags)
        issues.extend(record_issues)
        blocking = [issue for issue in record_issues if _should_quarantine(issue)]
        if blocking:
            rejected_ids.add(record.record_id)
            for issue in blocking:
                quarantine.append(
                    quarantine_from_gate_issue(
                        run_id=record.run_id,
                        artifact_id=record.artifact_id,
                        issue=issue,
                        reason=_quarantine_reason(issue.code),
                        raw_id=record.raw_id,
                        record_id=record.record_id,
                        raw_snapshot=dict(record.fields),
                        gate_name="industrial_truth",
                    )
                )

    clean_records = [record for record in records if record.record_id not in rejected_ids]
    verdict = _verdict(len(records), len(clean_records), issues)
    report = GateReport(
        gate_name="industrial_truth",
        verdict=verdict,
        accepted=len(clean_records),
        rejected=len(records) - len(clean_records),
        issues=issues,
    )
    return report, quarantine, clean_records


def _check_record(
    record: NormalizedRecord,
    seen_tags: dict[str, str],
) -> list[GateIssue]:
    issues: list[GateIssue] = []

    if record.tag_id:
        if record.tag_id in seen_tags:
            issues.append(
                _issue(
                    "DUPLICATE_TAG_ID",
                    f"Duplicate tag_id {record.tag_id} also seen on {seen_tags[record.tag_id]}.",
                    "HIGH",
                    record.source_ref,
                    fix="Resolve the duplicate tag binding and keep only one canonical row.",
                )
            )
        else:
            seen_tags[record.tag_id] = record.record_id

    if record.record_kind == "tag_candidate":
        issues.extend(_check_tag_truth(record))
    elif record.record_kind == "register_map_candidate":
        issues.extend(_check_register_truth(record))

    if record.confidence < 0.50:
        issues.append(
            _issue(
                "LOW_CONFIDENCE_RECORD",
                "Record confidence is below 0.50.",
                "HIGH",
                record.source_ref,
                fix="Review normalization evidence and correct the source row before approval.",
            )
        )
    elif record.confidence < 0.70:
        issues.append(
            _issue(
                "LOW_CONFIDENCE_RECORD",
                "Record confidence is below 0.70.",
                "MEDIUM",
                record.source_ref,
                fix="Confirm the normalized values against the source artifact.",
            )
        )

    return issues


def _check_tag_truth(record: NormalizedRecord) -> list[GateIssue]:
    issues: list[GateIssue] = []
    signal_type = record.signal_type or "unknown"
    unit = record.unit

    if signal_type == "unknown":
        issues.append(
            _issue(
                "UNKNOWN_SIGNAL_TYPE",
                "Signal type could not be inferred confidently.",
                "MEDIUM",
                record.source_ref,
                fix="Confirm the measurement type and update the signal label or tag mapping.",
            )
        )
    if not unit:
        issues.append(
            _issue(
                "UNKNOWN_UNIT",
                "Engineering unit is missing.",
                "MEDIUM",
                record.source_ref,
                fix="Provide the correct engineering unit for this signal.",
            )
        )
    elif signal_type != "unknown":
        for impossible_type, impossible_units in _IMPOSSIBLE_UNIT_SIGNAL:
            if signal_type == impossible_type and unit in impossible_units:
                issues.append(
                    _issue(
                        "UNIT_SIGNAL_MISMATCH",
                        f"Unit {unit} is implausible for signal_type {signal_type}.",
                        "HIGH",
                        record.source_ref,
                        fix="Correct the unit or signal classification to match industrial reality.",
                    )
                )
                break
        else:
            allowed = _SIGNAL_UNITS.get(signal_type)
            if allowed is not None and unit not in allowed:
                issues.append(
                    _issue(
                        "UNIT_SIGNAL_MISMATCH",
                        f"Unit {unit} is unusual for signal_type {signal_type}.",
                        "MEDIUM",
                        record.source_ref,
                        fix="Verify the unit matches the expected engineering domain for this signal.",
                    )
                )

    if record.tag_id and record.side:
        expected = _EXPECTED_SIDES.get(record.tag_id)
        if expected and record.side != expected:
            issues.append(
                _issue(
                    "SIDE_MISMATCH",
                    f"Tag {record.tag_id} has side {record.side} but expected {expected}.",
                    "HIGH",
                    record.source_ref,
                    fix="Correct the electrical or physical side to match the asset domain.",
                )
            )

    return issues


def _check_register_truth(record: NormalizedRecord) -> list[GateIssue]:
    issues: list[GateIssue] = []
    register = record.register or {}
    address = register.get("address")
    function_code = register.get("function_code")
    data_type = register.get("data_type")

    if address is not None:
        if not _is_non_negative_int_string(str(address)):
            issues.append(
                _issue(
                    "INVALID_REGISTER_ADDRESS",
                    f"Register address {address!r} must be a non-negative integer.",
                    "HIGH",
                    record.source_ref,
                    fix="Provide a valid Modbus register address as a non-negative integer.",
                )
            )

    if function_code is not None:
        normalized_fc = str(function_code).lstrip("0") or "0"
        if normalized_fc not in _VALID_FUNCTION_CODES and str(function_code) not in _VALID_FUNCTION_CODES:
            issues.append(
                _issue(
                    "INVALID_FUNCTION_CODE",
                    f"Function code {function_code!r} is not a supported Modbus code.",
                    "HIGH",
                    record.source_ref,
                    fix="Use one of 1, 2, 3, 4, 5, 6, 15, or 16 for the register function code.",
                )
            )
        elif str(function_code) in {"1", "2"} and data_type and data_type != "bool":
            issues.append(
                _issue(
                    "REGISTER_TYPE_UNIT_MISMATCH",
                    f"Function code {function_code} expects bool data type, not {data_type}.",
                    "MEDIUM",
                    record.source_ref,
                    fix="Set data_type to bool for coil/discrete register mappings.",
                )
            )

    if data_type is not None and data_type not in _VALID_DATA_TYPES:
        issues.append(
            _issue(
                "INVALID_DATA_TYPE",
                f"Data type {data_type!r} is not supported.",
                "HIGH",
                record.source_ref,
                fix="Use int16, uint16, int32, uint32, float32, or bool.",
            )
        )

    if data_type == "bool" and record.unit in _ANALOG_UNITS:
        issues.append(
            _issue(
                "REGISTER_TYPE_UNIT_MISMATCH",
                f"Bool register cannot use analog unit {record.unit}.",
                "HIGH",
                record.source_ref,
                fix="Remove the analog unit or change the register data type to match the signal.",
            )
        )

    return issues


def _is_non_negative_int_string(value: str) -> bool:
    if not value.isdigit():
        return False
    return int(value) >= 0


def _should_quarantine(issue: GateIssue) -> bool:
    if issue.code == "LOW_CONFIDENCE_RECORD":
        return issue.severity == "HIGH"
    return issue.severity in {"HIGH", "BLOCKER"}


def _quarantine_reason(code: str) -> QuarantineReason:
    if code == "DUPLICATE_TAG_ID":
        return "duplicate_conflict"
    if code == "MANUAL_REVIEW_REQUIRED":
        return "manual_review_required"
    if code in {"UNIT_SIGNAL_MISMATCH", "SIDE_MISMATCH", "INVALID_REGISTER_ADDRESS", "INVALID_FUNCTION_CODE", "INVALID_DATA_TYPE"}:
        return "industrial_truth_failed"
    if code == "LOW_CONFIDENCE_RECORD":
        return "industrial_truth_failed"
    return "manual_review_required"


def _mapping_fix(issue: str) -> str:
    if issue == "UNKNOWN_ASSET":
        return "Confirm the asset label and map it to the correct asset_id in Studio."
    if issue == "UNKNOWN_TAG":
        return "Confirm the tag hint/signal and map it to the correct canonical tag_id."
    if issue == "AMBIGUOUS_SIGNAL":
        return "Choose the correct tag mapping from the suggested matches or provide a new tag_id."
    if issue == "DUPLICATE_TAG":
        return "Resolve the duplicate tag_id conflict and keep only one canonical binding."
    if issue == "UNSAFE_SUGGESTION":
        return "Reject the unsafe suggestion and provide an approved industrial mapping."
    return "Review the mapping candidate and resolve it before draft approval."


def _issue(
    code: str,
    message: str,
    severity: str,
    source_ref,
    *,
    fix: str | None = None,
) -> GateIssue:
    return GateIssue(
        code=code,
        message=message,
        severity=severity,  # type: ignore[arg-type]
        field=code.lower(),
        fix=fix or "Review the record and correct the industrial mapping.",
        source_ref=source_ref,
    )


def _verdict(total: int, clean: int, issues: list[GateIssue]) -> GateVerdict:
    if total == 0 and not issues:
        return "skipped"
    if total > 0 and clean == 0:
        return "fail"
    if issues:
        return "warn"
    return "pass"