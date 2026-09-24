"""ORM models grouped by architectural layer (authored / compiled / event / derived / audit)."""

from app.db.models.audit import AuditRecordRow
from app.db.models.authored import (
    AuthoredConfigDocument,
    AuthoredPlantBundle,
    BundleRevision,
    ChangeRequest,
)
from app.db.models.compiled import CompiledBundle
from app.db.models.derived import DerivedCalmCardSnapshot, DerivedSituationSnapshot
from app.db.models.event import EventAlarm, EventTagFrame

LAYER_TABLES: dict[str, tuple[str, ...]] = {
    "authored": (
        AuthoredPlantBundle.__tablename__,
        AuthoredConfigDocument.__tablename__,
        BundleRevision.__tablename__,
        ChangeRequest.__tablename__,
    ),
    "compiled": (CompiledBundle.__tablename__,),
    "event": (
        EventTagFrame.__tablename__,
        EventAlarm.__tablename__,
    ),
    "derived": (
        DerivedSituationSnapshot.__tablename__,
        DerivedCalmCardSnapshot.__tablename__,
    ),
    "audit": (AuditRecordRow.__tablename__,),
}

__all__ = [
    "AuditRecordRow",
    "AuthoredConfigDocument",
    "AuthoredPlantBundle",
    "BundleRevision",
    "ChangeRequest",
    "CompiledBundle",
    "DerivedCalmCardSnapshot",
    "DerivedSituationSnapshot",
    "EventAlarm",
    "EventTagFrame",
    "LAYER_TABLES",
]