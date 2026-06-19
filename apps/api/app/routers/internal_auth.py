"""Internal auth probe routes for tests — not product write endpoints."""

from fastapi import APIRouter, Depends

from app.auth.dependencies import (
    get_current_principal,
    require_admin,
    require_engineer,
    require_human_approver,
    require_viewer,
)
from app.auth.principal import Principal
from app.auth.service import issue_dev_token
from app.settings import Settings, get_settings

router = APIRouter(prefix="/internal/auth-test", tags=["internal-auth"])


@router.get("/viewer")
async def viewer_probe(principal: Principal = Depends(require_viewer)) -> dict[str, str]:
    return {"status": "ok", "role": principal.role}


@router.post("/engineer-write")
async def engineer_write_probe(
    principal: Principal = Depends(require_engineer),
) -> dict[str, str]:
    return {"status": "ok", "role": principal.role}


@router.post("/admin-only")
async def admin_probe(principal: Principal = Depends(require_admin)) -> dict[str, str]:
    return {"status": "ok", "role": principal.role}


@router.post("/approve")
async def approve_probe(
    principal: Principal = Depends(require_human_approver),
) -> dict[str, str]:
    return {"status": "approved", "role": principal.role}


@router.get("/whoami")
async def whoami(principal: Principal = Depends(get_current_principal)) -> dict[str, str]:
    return {
        "subject": principal.subject,
        "role": principal.role,
        "actor_type": principal.actor_type,
    }


@router.post("/dev-token")
async def dev_token(
    payload: dict[str, str],
    settings: Settings = Depends(get_settings),
) -> dict[str, str]:
    if settings.plantlens_env not in {"dev", "test"}:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not found",
        )
    role = payload.get("role", "viewer")
    subject = payload.get("subject", "dev-user")
    actor_type = payload.get("actor_type", "agent" if role == "agent" else "user")
    token = issue_dev_token(
        settings,
        subject=subject,
        role=role,  # type: ignore[arg-type]
        actor_type=actor_type,  # type: ignore[arg-type]
    )
    return {"access_token": token, "token_type": "bearer"}