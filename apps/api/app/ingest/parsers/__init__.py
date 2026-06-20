"""Offline ingestion semantic parsers."""

from app.ingest.parsers.register_map import parse_register_map_records
from app.ingest.parsers.signal_list import parse_signal_list_records

__all__ = [
    "parse_register_map_records",
    "parse_signal_list_records",
]