"""ORM models grouped by architectural layer (authored / compiled / event / derived / audit)."""

from app.db.models.audit import AuditRecordRow
from app.db.models.authored import AuthoredConfigDocument, AuthoredPlantBundle
from app.db.models.compiled import CompiledBundle
from app.db.models.derived import DerivedCalmCardSnapshot, DerivedSituationSnapshot
from app.db.models.event import EventAlarm, EventTagFrame

LAYER_TABLES: dict[str, tuple[str, ...]] = {
    "authored": (
        AuthoredPlantBundle.__tablename__,
        AuthoredConfigDocument.__tablename__,
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
    "CompiledBundle",
    "DerivedCalmCardSnapshot",
    "DerivedSituationSnapshot",
    "EventAlarm",
    "EventTagFrame",
    "LAYER_TABLES",
]