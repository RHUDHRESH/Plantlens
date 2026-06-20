"""CSV dialect and header-row detection helpers for offline ingestion."""

from __future__ import annotations

import csv
import re
from io import StringIO

from pydantic import BaseModel, ConfigDict, Field

from app.ingest.adapters.base import clean_cell, clean_header

_NUMERIC_RE = re.compile(r"^-?\d+(\.\d+)?$")


class CsvDialectReport(BaseModel):
    """Lightweight CSV dialect sniff result."""

    model_config = ConfigDict(extra="forbid")

    delimiter: str
    quotechar: str | None = None
    has_header: bool
    header_row_index: int | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    warnings: list[str] = Field(default_factory=list)


def sniff_csv_dialect(content: bytes) -> CsvDialectReport:
    """Sniff delimiter and header row from raw CSV bytes."""
    warnings: list[str] = []
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError("csv dialect sniff requires utf-8-sig content") from exc

    delimiter = ","
    quotechar: str | None = '"'
    confidence = 0.5

    sample = "\n".join(text.splitlines()[:5])
    if sample.strip():
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
            delimiter = dialect.delimiter
            quotechar = dialect.quotechar or '"'
            confidence = 0.9
        except csv.Error:
            warnings.append("sniffer_fallback_comma")

    reader = csv.reader(StringIO(text), delimiter=delimiter)
    rows = [list(row) for row in reader]
    header_row_index = detect_header_row(rows)
    has_header = header_row_index is not None

    return CsvDialectReport(
        delimiter=delimiter,
        quotechar=quotechar,
        has_header=has_header,
        header_row_index=header_row_index,
        confidence=confidence,
        warnings=warnings,
    )


def detect_header_row(rows: list[list[str]]) -> int | None:
    """Return the zero-based index of the first likely header row.

    A header row is the first non-empty row with at least two non-empty cells
    whose values look like labels rather than numeric data.
    """
    for index, row in enumerate(rows):
        cells = [clean_cell(value) for value in row]
        non_empty = [cell for cell in cells if cell is not None]
        if len(non_empty) < 2:
            continue
        if _row_looks_like_header(non_empty):
            return index
    return None


def normalize_header_row(row: list[str]) -> list[str]:
    """Normalize a raw header row using adapter header cleaning."""
    return [clean_header(value) for value in row]


def _row_looks_like_header(cells: list[str]) -> bool:
    numeric_count = sum(1 for cell in cells if _NUMERIC_RE.match(cell))
    return numeric_count < len(cells)