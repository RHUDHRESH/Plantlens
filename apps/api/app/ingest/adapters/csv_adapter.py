"""CSV tabular adapter for offline authored-knowledge ingestion."""

from __future__ import annotations

import csv
from datetime import UTC, datetime
from io import StringIO
from typing import Any

from app.schemas.ingest.artifact import RawArtifact
from app.schemas.ingest.record import RawRecord, SourceRef

from app.ingest.adapters.base import (
    AdapterParseError,
    AdapterResult,
    clean_cell,
    clean_header,
    make_raw_id,
    reject_duplicate_headers,
    row_is_empty,
)


class CsvAdapter:
    """Extract RawRecord rows from CSV bytes without semantic interpretation."""

    def extract_records(self, *, artifact: RawArtifact, content: bytes) -> AdapterResult:
        text = self._decode_text(content)
        lines = text.splitlines()
        if not lines:
            return AdapterResult(
                artifact=artifact,
                records=[],
                warnings=[],
                metadata={
                    "delimiter": ",",
                    "header_row_number": None,
                    "original_headers": [],
                    "cleaned_headers": [],
                    "skipped_empty_rows": 0,
                    "record_count": 0,
                },
            )

        delimiter = self._detect_delimiter(text)
        reader = csv.reader(StringIO(text), delimiter=delimiter)

        header_row_number: int | None = None
        original_headers: list[str] = []
        cleaned_headers: list[str] = []
        records: list[RawRecord] = []
        warnings: list[str] = []
        skipped_empty_rows = 0

        for row_number, row in enumerate(reader, start=1):
            if row_is_empty(row):
                skipped_empty_rows += 1
                continue

            if header_row_number is None:
                header_row_number = row_number
                original_headers = [str(cell) for cell in row]
                cleaned_headers = [clean_header(header) for header in original_headers]
                reject_duplicate_headers(cleaned_headers, context="csv")
                continue

            row_warnings = self._width_warnings(row, cleaned_headers)
            fields = self._build_fields(row, cleaned_headers)
            if not fields:
                skipped_empty_rows += 1
                continue

            records.append(
                RawRecord(
                    raw_id=make_raw_id(),
                    artifact_id=artifact.artifact_id,
                    run_id=artifact.run_id,
                    row_number=row_number,
                    sheet_name=None,
                    fields=fields,
                    source_ref=SourceRef(
                        artifact_id=artifact.artifact_id,
                        artifact_sha256=artifact.sha256,
                        row_number=row_number,
                        sheet_name=None,
                        column_name=None,
                    ),
                    extracted_at_utc=datetime.now(UTC),
                    parser_warnings=row_warnings,
                )
            )

        metadata: dict[str, Any] = {
            "delimiter": delimiter,
            "header_row_number": header_row_number,
            "original_headers": original_headers,
            "cleaned_headers": cleaned_headers,
            "skipped_empty_rows": skipped_empty_rows,
            "record_count": len(records),
        }
        return AdapterResult(
            artifact=artifact,
            records=records,
            warnings=warnings,
            metadata=metadata,
        )

    def _decode_text(self, content: bytes) -> str:
        try:
            return content.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise AdapterParseError("csv decode failed: content is not valid utf-8-sig") from exc

    def _detect_delimiter(self, text: str) -> str:
        sample = "\n".join(text.splitlines()[:5])
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
            return dialect.delimiter
        except csv.Error:
            return ","

    def _width_warnings(self, row: list[str], cleaned_headers: list[str]) -> list[str]:
        warnings: list[str] = []
        if len(row) > len(cleaned_headers):
            warnings.append("row_has_extra_columns")
        elif len(row) < len(cleaned_headers):
            warnings.append("row_has_missing_columns")
        return warnings

    def _build_fields(self, row: list[str], cleaned_headers: list[str]) -> dict[str, str | None]:
        fields: dict[str, str | None] = {}
        for index, header in enumerate(cleaned_headers):
            value = row[index] if index < len(row) else None
            fields[header] = clean_cell(value)
        return fields