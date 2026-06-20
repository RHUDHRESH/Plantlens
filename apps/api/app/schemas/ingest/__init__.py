"""Offline authored-knowledge ingestion Pydantic schemas (draft-only path)."""

from app.schemas.ingest.api import (
    OfflineDraftsResponse,
    OfflineIngestStartResponse,
    OfflineQuarantineResponse,
    OfflineRunSummary,
    OfflineTextIngestRequest,
    ResolveQuarantineRequest,
)
from app.schemas.ingest.artifact import DocumentKind, RawArtifact, SourceChannel
from app.schemas.ingest.detection import DetectionReport
from app.schemas.ingest.draft import DraftContract, DraftStatus, DraftType, DraftValidationStatus
from app.schemas.ingest.gates import GateIssue, GateName, GateReport, GateSeverity, GateVerdict
from app.schemas.ingest.mapping import (
    MappingCandidate,
    MappingIssue,
    MappingStatus,
    MappingTargetType,
    SuggestedMatch,
)
from app.schemas.ingest.normalized import NormalizedRecord, RecordKind, SideKind
from app.schemas.ingest.quarantine import QuarantineRecord, QuarantineReason
from app.schemas.ingest.record import RawRecord, SourceRef
from app.schemas.ingest.report import (
    ConfidenceDistribution,
    HumanAction,
    HumanActionType,
    IngestionRunReport,
    IngestionTotals,
    RunStatus,
)

__all__ = [
    "ConfidenceDistribution",
    "DetectionReport",
    "DocumentKind",
    "DraftContract",
    "DraftStatus",
    "DraftType",
    "DraftValidationStatus",
    "GateIssue",
    "GateName",
    "GateReport",
    "GateSeverity",
    "GateVerdict",
    "HumanAction",
    "HumanActionType",
    "IngestionRunReport",
    "IngestionTotals",
    "MappingCandidate",
    "MappingIssue",
    "MappingStatus",
    "MappingTargetType",
    "NormalizedRecord",
    "OfflineDraftsResponse",
    "OfflineIngestStartResponse",
    "OfflineQuarantineResponse",
    "OfflineRunSummary",
    "OfflineTextIngestRequest",
    "QuarantineRecord",
    "QuarantineReason",
    "RawArtifact",
    "RawRecord",
    "RecordKind",
    "ResolveQuarantineRequest",
    "RunStatus",
    "SideKind",
    "SourceChannel",
    "SourceRef",
    "SuggestedMatch",
]