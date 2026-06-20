"""Offline ingestion raw record and source provenance models."""

from typing import Self

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator

_SHA256_PATTERN = r"^[a-f0-9]{64}$"


class SourceRef(BaseModel):
    """Provenance link back to the originating artifact and cell/row locator."""

    model_config = ConfigDict(extra="forbid")

    artifact_id: str
    artifact_sha256: str = Field(pattern=_SHA256_PATTERN)
    row_number: int | None = None
    sheet_name: str | None = None
    column_name: str | None = None
    cell_ref: str | None = None
    json_pointer: str | None = None

    @field_validator("artifact_id")
    @classmethod
    def validate_artifact_id_prefix(cls, value: str) -> str:
        if not value.startswith("art_"):
            raise ValueError("artifact_id must start with art_")
        return value

    @field_validator("row_number")
    @classmethod
    def validate_row_number(cls, value: int | None) -> int | None:
        if value is not None and value < 1:
            raise ValueError("row_number must be >= 1 when present")
        return value

    @model_validator(mode="after")
    def validate_locator_present(self) -> Self:
        # Artifact-level refs (e.g. document-kind detection on the whole file) may omit
        # row/sheet/column/cell/json locators; row-level records always set at least one.
        return self


class RawRecord(BaseModel):
    """Adapter output — one row before normalization."""

    model_config = ConfigDict(extra="forbid")

    raw_id: str
    artifact_id: str
    run_id: str
    row_number: int = Field(ge=1)
    sheet_name: str | None = None
    fields: dict[str, str | None]
    source_ref: SourceRef
    extracted_at_utc: AwareDatetime
    parser_warnings: list[str] = Field(default_factory=list)

    @field_validator("raw_id")
    @classmethod
    def validate_raw_id_prefix(cls, value: str) -> str:
        if not value.startswith("raw_"):
            raise ValueError("raw_id must start with raw_")
        return value

    @field_validator("artifact_id")
    @classmethod
    def validate_artifact_id_prefix(cls, value: str) -> str:
        if not value.startswith("art_"):
            raise ValueError("artifact_id must start with art_")
        return value

    @field_validator("run_id")
    @classmethod
    def validate_run_id_prefix(cls, value: str) -> str:
        if not value.startswith("run_"):
            raise ValueError("run_id must start with run_")
        return value

    @field_validator("fields")
    @classmethod
    def validate_fields_non_empty(cls, value: dict[str, str | None]) -> dict[str, str | None]:
        if not value:
            raise ValueError("fields must not be empty")
        return value