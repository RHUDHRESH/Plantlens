"""Authentication and RBAC — OIDC in production, explicit dev JWT in local/test."""

from app.auth.principal import Principal, Role
from app.auth.service import AuthConfigurationError, issue_dev_token, verify_bearer_token

__all__ = [
    "AuthConfigurationError",
    "Principal",
    "Role",
    "issue_dev_token",
    "verify_bearer_token",
]