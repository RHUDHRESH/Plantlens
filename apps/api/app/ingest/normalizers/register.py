"""Register-map field normalization for offline ingestion."""

from __future__ import annotations

import re

from app.ingest.normalizers.common import NormalizationResult, is_blank, normalize_token

_FUNCTION_CODE_ALIASES: dict[str, str] = {
    "1": "1",
    "2": "2",
    "3": "3",
    "4": "4",
    "5": "5",
    "6": "6",
    "15": "15",
    "16": "16",
    "01": "1",
    "02": "2",
    "03": "3",
    "04": "4",
    "05": "5",
    "06": "6",
    "FC01": "1",
    "FC02": "2",
    "FC03": "3",
    "FC04": "4",
    "FC05": "5",
    "FC06": "6",
    "FC15": "15",
    "FC16": "16",
    "FUNCTION_1": "1",
    "FUNCTION_2": "2",
    "FUNCTION_3": "3",
    "FUNCTION_4": "4",
    "FUNCTION_5": "5",
    "FUNCTION_6": "6",
    "FUNCTION_15": "15",
    "FUNCTION_16": "16",
    "READ_COILS": "1",
    "READ_DISCRETE_INPUTS": "2",
    "READ_HOLDING_REGISTERS": "3",
    "READ_INPUT_REGISTERS": "4",
    "WRITE_SINGLE_COIL": "5",
    "WRITE_SINGLE_REGISTER": "6",
    "WRITE_MULTIPLE_COILS": "15",
    "WRITE_MULTIPLE_REGISTERS": "16",
}

_DATA_TYPE_ALIASES: dict[str, str] = {
    "INT16": "int16",
    "SIGNED16": "int16",
    "UINT16": "uint16",
    "UNSIGNED16": "uint16",
    "INT32": "int32",
    "SIGNED32": "int32",
    "UINT32": "uint32",
    "UNSIGNED32": "uint32",
    "FLOAT": "float32",
    "FLOAT32": "float32",
    "REAL": "float32",
    "BOOL": "bool",
    "BOOLEAN": "bool",
}


def normalize_register_address(value: str | int | None) -> NormalizationResult:
    """Normalize a Modbus/register address to a canonical decimal string."""
    if value is None or (isinstance(value, str) and is_blank(value)):
        return NormalizationResult(
            value=None,
            confidence=0.0,
            warnings=["missing_register_address"],
        )

    if isinstance(value, int):
        if value < 0:
            return NormalizationResult(
                value=None,
                confidence=0.0,
                warnings=["invalid_register_address"],
            )
        return NormalizationResult(value=str(value), confidence=1.0, notes=["parsed_integer_address"])

    raw = str(value).strip()
    if raw.lower().startswith("0x"):
        try:
            parsed = int(raw, 16)
        except ValueError:
            return NormalizationResult(
                value=None,
                confidence=0.0,
                warnings=["invalid_register_address"],
            )
        if parsed < 0:
            return NormalizationResult(
                value=None,
                confidence=0.0,
                warnings=["invalid_register_address"],
            )
        return NormalizationResult(value=str(parsed), confidence=1.0, notes=["parsed_hex_address"])

    if re.fullmatch(r"\d+", raw):
        return NormalizationResult(value=raw, confidence=1.0, notes=["parsed_decimal_address"])

    return NormalizationResult(
        value=None,
        confidence=0.0,
        warnings=["invalid_register_address"],
    )


def normalize_function_code(value: str | int | None) -> NormalizationResult:
    """Normalize a Modbus function code."""
    if value is None or (isinstance(value, str) and is_blank(value)):
        return NormalizationResult(
            value=None,
            confidence=0.0,
            warnings=["missing_function_code"],
        )

    if isinstance(value, int):
        canonical = str(value)
        if canonical in _FUNCTION_CODE_ALIASES.values():
            return NormalizationResult(value=canonical, confidence=1.0, notes=["parsed_integer_function_code"])
        return NormalizationResult(
            value=None,
            confidence=0.0,
            warnings=["unknown_function_code"],
        )

    token = normalize_token(str(value))
    phrase_key = re.sub(r"[^A-Z0-9]+", "_", str(value).strip().upper()).strip("_")
    if phrase_key in _FUNCTION_CODE_ALIASES:
        return NormalizationResult(
            value=_FUNCTION_CODE_ALIASES[phrase_key],
            confidence=1.0,
            notes=["matched_function_code_alias"],
        )
    if token in _FUNCTION_CODE_ALIASES:
        return NormalizationResult(
            value=_FUNCTION_CODE_ALIASES[token],
            confidence=1.0,
            notes=["matched_function_code_alias"],
        )

    return NormalizationResult(
        value=None,
        confidence=0.0,
        warnings=["unknown_function_code"],
    )


def normalize_data_type(value: str | None) -> NormalizationResult:
    """Normalize a register data-type label."""
    if is_blank(value):
        return NormalizationResult(
            value=None,
            confidence=0.0,
            warnings=["missing_data_type"],
        )

    token = normalize_token(value)
    if token in _DATA_TYPE_ALIASES:
        return NormalizationResult(
            value=_DATA_TYPE_ALIASES[token],
            confidence=1.0,
            notes=["matched_data_type_alias"],
        )

    return NormalizationResult(
        value=str(value).strip(),
        confidence=0.4,
        warnings=["unknown_data_type"],
        notes=["fallback_raw_data_type"],
    )