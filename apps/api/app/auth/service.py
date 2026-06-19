"""Bearer token verification — OIDC when configured, dev JWT otherwise."""

from __future__ import annotations

import time
from typing import Any

from authlib.jose import JsonWebToken, JWTClaims
from authlib.jose.errors import JoseError
from fastapi import HTTPException, status

from app.auth.principal import ActorType, Principal, Role
from app.settings import Settings

DEV_ISSUER = "plantlens-dev"
DEV_AUDIENCE = "plantlens-api"


class AuthConfigurationError(RuntimeError):
    """Auth is not configured for the current environment."""


def _resolve_auth_mode(settings: Settings) -> str:
    if settings.oidc_issuer and settings.oidc_jwks_url and settings.oidc_audience:
        return "oidc"
    if settings.plantlens_env in {"dev", "test"} and settings.dev_jwt_secret:
        return "dev_jwt"
    return "unconfigured"


def _role_from_claims(claims: dict[str, Any]) -> Role:
    raw_role = claims.get("role") or claims.get("plantlens_role")
    if not isinstance(raw_role, str):
        msg = "Token missing role claim"
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=msg)
    allowed: set[Role] = {
        "viewer",
        "engineer",
        "operator",
        "maintenance",
        "admin",
        "agent",
    }
    if raw_role not in allowed:
        msg = "Token role is not recognized"
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=msg)
    return raw_role  # type: ignore[return-value]


def _actor_type_for_role(role: Role, claims: dict[str, Any]) -> ActorType:
    claim_actor = claims.get("actor_type")
    if role == "agent":
        return "agent"
    if claim_actor in {"user", "agent", "system"}:
        return claim_actor  # type: ignore[return-value]
    return "user"


def issue_dev_token(
    settings: Settings,
    *,
    subject: str,
    role: Role,
    actor_type: ActorType = "user",
    ttl_seconds: int = 3600,
) -> str:
    """Issue a signed dev JWT for local/test use only."""
    if _resolve_auth_mode(settings) != "dev_jwt":
        msg = "Dev token issuance is only available in dev/test with PLANTLENS_DEV_JWT_SECRET"
        raise AuthConfigurationError(msg)
    now = int(time.time())
    claims = {
        "sub": subject,
        "role": role,
        "actor_type": actor_type,
        "iss": DEV_ISSUER,
        "aud": DEV_AUDIENCE,
        "iat": now,
        "exp": now + ttl_seconds,
    }
    jwt = JsonWebToken(["HS256"])
    return jwt.encode({"alg": "HS256"}, claims, settings.dev_jwt_secret).decode("utf-8")


def _verify_dev_jwt(token: str, settings: Settings) -> Principal:
    jwt = JsonWebToken(["HS256"])
    try:
        claims: JWTClaims = jwt.decode(token, settings.dev_jwt_secret)
        claims.validate()
    except JoseError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid bearer token",
        ) from exc

    issuer = claims.get("iss")
    audience = claims.get("aud")
    if issuer != DEV_ISSUER or audience != DEV_AUDIENCE:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid bearer token issuer or audience",
        )

    role = _role_from_claims(dict(claims))
    subject = str(claims.get("sub") or "")
    if not subject:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject",
        )
    return Principal(
        subject=subject,
        role=role,
        actor_type=_actor_type_for_role(role, dict(claims)),
        display_name=claims.get("name"),
    )


def _verify_oidc_jwt(token: str, settings: Settings) -> Principal:
    jwt = JsonWebToken(["RS256", "ES256", "PS256"])
    try:
        claims: JWTClaims = jwt.decode(
            token,
            key=None,
            claims_options={
                "iss": {"essential": True, "value": settings.oidc_issuer},
                "aud": {"essential": True, "value": settings.oidc_audience},
            },
        )
        claims.validate(leeway=30)
    except JoseError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid bearer token",
        ) from exc

    role = _role_from_claims(dict(claims))
    subject = str(claims.get("sub") or "")
    if not subject:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject",
        )
    return Principal(
        subject=subject,
        role=role,
        actor_type=_actor_type_for_role(role, dict(claims)),
        display_name=claims.get("name"),
    )


def verify_bearer_token(token: str, settings: Settings) -> Principal:
    """Verify a bearer token and return the authenticated principal."""
    mode = _resolve_auth_mode(settings)
    if mode == "unconfigured":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication is not configured",
        )
    if mode == "dev_jwt":
        return _verify_dev_jwt(token, settings)
    return _verify_oidc_jwt(token, settings)