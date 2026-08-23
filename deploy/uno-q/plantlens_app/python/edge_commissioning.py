"""Explainable edge-AI shadow receipt for live UNO Q commissioning.

This module is deliberately outside the gateway and deterministic runtime
diagnosis paths.  It consumes the gateway's read-only cache, requires coherent
Modbus word pairs, and emits a commissioning-only shadow receipt.  It never
creates alarms, mutates rules, or writes hardware.
"""

from __future__ import annotations

import math
import struct
from typing import Any, Protocol

from fastapi import APIRouter

from app.edge_research.compact_ensemble import CompactFaultEnsemble, FEATURES
from app.edge_research.motor_fingerprint import ElectricalSample, MotorFingerprintModel


SLAVE_ID = 5
PAIR_STARTS = (4, 6, 8, 10)

# Provisional low-load baseline observed during this commissioning session.
# It is not promoted into the canonical plant model or alarm rules.
BASELINE = {
    "voltage_candidate": 27.15444,
    "current_candidate": 2.26244,
    "power_candidate": 61.43538,
}
WARNING_MULTIPLIER = 1.5
CRITICAL_MULTIPLIER = 2.0

FINGERPRINT_MODEL = MotorFingerprintModel.fit(
    (
        ElectricalSample(27.15444, 2.26244, 61.43538),
        ElectricalSample(26.91980, 15.39559, 413.48633),
        ElectricalSample(26.99155, 24.25614, 656.78320),
    )
)


class RegisterCache(Protocol):
    def register_rows(self) -> list[dict[str, Any]]: ...


def decode_cdab_float(first_word: float, second_word: float) -> float:
    """Decode two Modbus words using the observed CDAB word order."""

    payload = struct.pack(">HH", int(second_word) & 0xFFFF, int(first_word) & 0xFFFF)
    return struct.unpack(">f", payload)[0]


def _ratio_feature(value: float, baseline: float) -> float:
    """Symmetric, bounded log-ratio feature for the compact shadow model."""

    if value <= 0 or baseline <= 0:
        return 0.0
    return max(-8.0, min(8.0, math.log2(value / baseline)))


def commissioning_receipt(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Build a read-only shadow receipt from one coherent slave-5 response."""

    selected = {
        int(row["register"]): row
        for row in rows
        if int(row.get("slave_id", -1)) == SLAVE_ID
        and int(row.get("register", -1)) in range(4, 12)
    }
    missing = [register for register in range(4, 12) if register not in selected]
    timestamps = {str(row.get("timestamp")) for row in selected.values()}
    if missing or len(timestamps) != 1:
        return {
            "status": "ABSTAIN",
            "reason": "INCOHERENT_OR_INCOMPLETE_MODBUS_FRAME",
            "missing_registers": missing,
            "timestamp_count": len(timestamps),
            "read_only": True,
            "runtime_diagnosis": False,
        }

    decoded = {
        start: decode_cdab_float(selected[start]["value"], selected[start + 1]["value"])
        for start in PAIR_STARTS
    }
    if any(not math.isfinite(value) for value in decoded.values()):
        return {
            "status": "ABSTAIN",
            "reason": "NON_FINITE_DECODE",
            "read_only": True,
            "runtime_diagnosis": False,
        }

    voltage, current, power, auxiliary = (decoded[start] for start in PAIR_STARTS)
    current_ratio = current / BASELINE["current_candidate"]
    power_ratio = power / BASELINE["power_candidate"]
    voltage_ratio = voltage / BASELINE["voltage_candidate"]
    balance_error = abs(power - voltage * current) / max(abs(power), 1e-9)

    if current_ratio >= CRITICAL_MULTIPLIER or power_ratio >= CRITICAL_MULTIPLIER:
        threshold_state = "LOW_LOAD_ENVELOPE_EXCEEDED"
    elif current_ratio >= WARNING_MULTIPLIER or power_ratio >= WARNING_MULTIPLIER:
        threshold_state = "ABOVE_LOW_LOAD_BASELINE"
    else:
        threshold_state = "WITHIN_LOW_LOAD_BASELINE"

    features = {feature: 0.0 for feature in FEATURES}
    features.update(
        current_z=_ratio_feature(current, BASELINE["current_candidate"]),
        power_z=_ratio_feature(power, BASELINE["power_candidate"]),
        voltage_sag_z=max(0.0, -_ratio_feature(voltage, BASELINE["voltage_candidate"])),
        mapping_error=min(8.0, balance_error * 10.0),
    )
    quality = {feature: 0.0 for feature in FEATURES}
    for feature in ("current_z", "power_z", "voltage_sag_z", "mapping_error"):
        quality[feature] = 1.0

    decision = CompactFaultEnsemble().infer(features, quality)
    top = decision.estimates[0]
    fingerprint = FINGERPRINT_MODEL.infer(ElectricalSample(voltage, current, power))
    missing_features = [feature for feature in FEATURES if quality[feature] == 0.0]
    if fingerprint.decision == "KNOWN_SIGNATURE" and decision.abstention_reasons:
        fault_status = "SHADOW_CANDIDATE"
        fault_title = f"{top.fault_id.replace('_', ' ').title()} candidate — evidence incomplete"
        interpretation = (
            "Electrical load matches a learned operating signature. The leading fault family "
            "is shown for investigation, but missing mechanical and thermal evidence blocks confirmation."
        )
    elif fingerprint.decision == "KNOWN_SIGNATURE":
        fault_status = "KNOWN_SIGNATURE"
        fault_title = "Known motor operating signature"
        interpretation = "The electrical fingerprint matches a learned motor operating mode."
    else:
        fault_status = "UNRECOGNIZED_SIGNATURE"
        fault_title = "Unrecognized motor signature"
        interpretation = "The live electrical fingerprint is outside the learned operating modes."
    return {
        "status": "SHADOW_RESULT",
        "observed_at": timestamps.pop(),
        "edge_node": "UNO Q",
        "mode": "READ_ONLY_COMMISSIONING",
        "mapping": {
            "state": "INFERRED_UNCONFIRMED",
            "slave_id": SLAVE_ID,
            "word_order": "CDAB",
            "pairs": {"voltage": [4, 5], "current": [6, 7], "power": [8, 9], "auxiliary": [10, 11]},
        },
        "measurements": {
            "voltage_candidate": round(voltage, 5),
            "current_candidate": round(current, 5),
            "power_candidate": round(power, 5),
            "auxiliary_candidate": round(auxiliary, 5),
            "power_balance_error_pct": round(balance_error * 100.0, 3),
        },
        "thresholds": {
            "state": threshold_state,
            "provisional": True,
            "warning_multiplier": WARNING_MULTIPLIER,
            "critical_multiplier": CRITICAL_MULTIPLIER,
            "current_warning": round(BASELINE["current_candidate"] * WARNING_MULTIPLIER, 5),
            "current_critical": round(BASELINE["current_candidate"] * CRITICAL_MULTIPLIER, 5),
            "power_warning": round(BASELINE["power_candidate"] * WARNING_MULTIPLIER, 5),
            "power_critical": round(BASELINE["power_candidate"] * CRITICAL_MULTIPLIER, 5),
            "current_ratio": round(current_ratio, 3),
            "power_ratio": round(power_ratio, 3),
            "voltage_ratio": round(voltage_ratio, 3),
        },
        "ensemble": {
            "decision": decision.decision,
            "top_shadow_candidate": top.fault_id,
            "probability": round(top.probability, 6),
            "disagreement": round(top.disagreement, 6),
            "effective_quality": round(decision.effective_quality, 3),
            "novelty_score": round(decision.novelty_score, 3),
            "abstention_reasons": list(decision.abstention_reasons),
            "contributors": [
                {"feature": feature, "contribution": round(contribution, 4)}
                for feature, contribution in top.contributors
            ],
            "candidates": [
                {
                    "fault_id": estimate.fault_id,
                    "probability": round(estimate.probability, 6),
                    "disagreement": round(estimate.disagreement, 6),
                }
                for estimate in decision.estimates
            ],
            "missing_features": missing_features,
        },
        "motor_fingerprint": {
            "model_type": "physics_informed_rbf_one_class",
            "model_sha256": fingerprint.model_sha256,
            "trained_samples": FINGERPRINT_MODEL.trained_samples,
            "decision": fingerprint.decision,
            "matched_prototype": fingerprint.matched_prototype,
            "similarity": round(fingerprint.similarity, 6),
            "novelty_score": round(fingerprint.novelty_score, 6),
            "confidence": round(fingerprint.confidence, 6),
            "contributors": [
                {"feature": feature, "deviation": round(deviation, 4)}
                for feature, deviation in fingerprint.contributors
            ],
            "limitations": [
                "Three commissioning samples only",
                "Electrical signature only; vibration, RPM, and temperature are not yet connected",
                "Shadow inference; not an approved runtime diagnosis",
            ],
        },
        "fault_summary": {
            "status": fault_status,
            "title": fault_title,
            "interpretation": interpretation,
            "recommended_checks": [
                "Commission motor RPM to verify speed droop",
                "Commission vibration RMS and axis imbalance",
                "Commission motor temperature and temperature slope",
                "Approve the register mapping before enabling deterministic alarm rules",
            ],
        },
        "explanation": (
            f"Load candidate is {current_ratio:.1f}x and power candidate is {power_ratio:.1f}x "
            f"the observed low-load baseline; voltage is {voltage_ratio:.2f}x baseline and "
            f"the V×I consistency error is {balance_error * 100.0:.2f}%."
        ),
        "read_only": True,
        "runtime_diagnosis": False,
    }


def build_edge_router(gateway: RegisterCache) -> APIRouter:
    router = APIRouter(tags=["uno-q-edge-commissioning"])

    @router.get("/api/edge/commissioning")
    async def edge_commissioning() -> dict[str, Any]:
        return commissioning_receipt(gateway.register_rows())

    return router
