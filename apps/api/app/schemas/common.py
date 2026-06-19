"""Shared contract enums mirrored from packages/contracts."""

from typing import Literal

TagQuality = Literal["GOOD", "UNCERTAIN", "BAD", "STALE", "MISSING"]
TagSource = Literal["simulator", "modbus_rtu", "modbus_tcp", "manual", "backfill"]

Severity = Literal["info", "warning", "critical"]
Confidence = Literal["low", "medium", "high"]
RiskLevel = Literal["low", "medium", "high", "unknown"]

EvidenceRole = Literal["first_signal", "evidence", "consequence"]
AlarmOp = Literal["<", "<=", ">", ">=", "==", "!=", "bool_true", "bool_false"]

ActorType = Literal["user", "agent", "system"]
ActorRole = Literal["operator", "engineer", "maintenance", "supervisor", "admin", "agent"]

TimeToConsequenceState = Literal["approaching_limit", "stable", "unknown", "exceeded", "counting"]

TagValue = float | str | bool | None