"""Read-only view of the hash-chained audit ledger (R6)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_engineer
from app.auth.principal import Principal
from app.db.repositories import audit as audit_repo
from app.dependencies import get_db
from app.services.audit_chain import verify_chain

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("")
async def list_audit_records(
    action: str | None = Query(default=None, description="Prefix filter, e.g. 'change.' or 'alarm.'"),
    entity_id: str | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    _principal: Principal = Depends(require_engineer),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    rows = await audit_repo.list_records_ordered(session)
    records = [audit_repo.row_to_record_dict(row) for row in rows]
    verification = verify_chain(records)
    filtered = [
        r
        for r in records
        if (action is None or str(r.get("action", "")).startswith(action))
        and (entity_id is None or r.get("entity_id") == entity_id)
    ]
    newest_first = list(reversed(filtered))
    return {
        "total": len(filtered),
        "records": newest_first[offset : offset + limit],
        "chain": {
            "valid": verification.valid,
            "checked_records": verification.checked_records,
            "broken_index": verification.broken_index,
            "reason": verification.reason,
        },
    }
