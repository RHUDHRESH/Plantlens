"""FastAPI auth dependencies."""

from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.principal import (
    ADMIN_ROLES,
    ENGINEER_WRITE_ROLES,
    HUMAN_APPROVER_ROLES,
    Principal,
    Role,
)
from app.auth.service import verify_bearer_token
from app.settings import Settings, get_settings

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_principal(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    settings: Settings = Depends(get_settings),
) -> Principal:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return verify_bearer_token(credentials.credentials, settings)


def require_roles(*roles: Role) -> Callable[..., Principal]:
    allowed = frozenset(roles)

    async def _guard(principal: Principal = Depends(get_current_principal)) -> Principal:
        if principal.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient role",
            )
        return principal

    return _guard


require_viewer = require_roles("viewer", "engineer", "operator", "maintenance", "admin", "agent")
require_engineer = require_roles(*ENGINEER_WRITE_ROLES)
require_admin = require_roles(*ADMIN_ROLES)


async def require_human_approver(
    principal: Principal = Depends(get_current_principal),
) -> Principal:
    if principal.is_agent:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agents cannot approve human-gated actions",
        )
    if principal.role not in HUMAN_APPROVER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Human approver role required",
        )
    return principal