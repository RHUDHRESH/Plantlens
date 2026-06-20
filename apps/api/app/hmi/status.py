"""Deterministic HMI signal-status and data-quality evaluation."""

from datetime import datetime

from app.hmi.bench_adapter import BenchSignal, BenchSignalQuality
from app.hmi.contracts import DataQualityState, ExpectedRange, HMISignalStatus, SignalHMIState

_MISSING_PENALTY = 0.25
_STALE_PENALTY = 0.15
_MAX_CONFIDENCE_PENALTY = 0.6
_NORMAL_EVIDENCE_WEIGHT = 0.2
_WARNING_EVIDENCE_WEIGHT = 0.5
_FAULT_EVIDENCE_WEIGHT = 1.0
_ZERO_EVIDENCE_WEIGHT = 0.0
_WARNING_BAND_FRACTION = 0.10
_ABSOLUTE_WARNING_BAND = 0.1


def evaluate_signal_status(
    signal: BenchSignal,
    *,
    now: datetime,
    stale_after_seconds: int = 5,
) -> SignalHMIState:
    """Map one bench signal to an HMI signal state without mutating the input."""
    expected_range = _build_expected_range(signal)

    if _is_missing(signal):
        status = HMISignalStatus.MISSING
        evidence_weight = _ZERO_EVIDENCE_WEIGHT
    elif _is_stale(signal, now=now, stale_after_seconds=stale_after_seconds):
        status = HMISignalStatus.STALE
        evidence_weight = _ZERO_EVIDENCE_WEIGHT
    elif _is_fault(signal):
        status = HMISignalStatus.FAULT
        evidence_weight = _FAULT_EVIDENCE_WEIGHT
    elif _is_warning(signal):
        status = HMISignalStatus.WARNING
        evidence_weight = _WARNING_EVIDENCE_WEIGHT
    else:
        status = HMISignalStatus.NORMAL
        evidence_weight = _NORMAL_EVIDENCE_WEIGHT

    return SignalHMIState(
        signal_id=signal.signal_id,
        asset_id=signal.asset_id,
        name=signal.name,
        value=signal.value,
        unit=signal.unit,
        status=status,
        expected_range=expected_range,
        evidence_weight=evidence_weight,
        timestamp=signal.timestamp,
    )


def evaluate_signals(
    signals: list[BenchSignal],
    *,
    now: datetime,
    stale_after_seconds: int = 5,
) -> list[SignalHMIState]:
    """Evaluate bench signals in input order."""
    return [
        evaluate_signal_status(signal, now=now, stale_after_seconds=stale_after_seconds)
        for signal in signals
    ]


def build_data_quality(signals: list[SignalHMIState]) -> DataQualityState:
    """Derive deterministic data-quality penalties from evaluated signal states."""
    missing_signals = sorted(
        signal.signal_id for signal in signals if signal.status == HMISignalStatus.MISSING
    )
    stale_signals = sorted(
        signal.signal_id for signal in signals if signal.status == HMISignalStatus.STALE
    )

    raw_penalty = (
        len(missing_signals) * _MISSING_PENALTY + len(stale_signals) * _STALE_PENALTY
    )
    confidence_penalty = round(min(raw_penalty, _MAX_CONFIDENCE_PENALTY), 4)

    notes: list[str] = []
    for signal_id in missing_signals:
        notes.append(f"Signal {signal_id} is missing; confidence reduced.")
    for signal_id in stale_signals:
        notes.append(f"Signal {signal_id} is stale or degraded; confidence reduced.")

    return DataQualityState(
        missing_signals=missing_signals,
        stale_signals=stale_signals,
        confidence_penalty=confidence_penalty,
        notes=notes,
    )


def confidence_after_data_quality(
    base_confidence: float,
    data_quality: DataQualityState,
) -> float:
    """Apply data-quality penalty to a base confidence score."""
    clamped_base = clamp_confidence(base_confidence)
    adjusted = clamped_base - data_quality.confidence_penalty
    return round(clamp_confidence(adjusted), 4)


def clamp_confidence(value: float) -> float:
    """Clamp a confidence value to the closed interval [0.0, 1.0]."""
    return min(1.0, max(0.0, value))


def _build_expected_range(signal: BenchSignal) -> ExpectedRange | None:
    if signal.expected_min is None and signal.expected_max is None:
        return None
    return ExpectedRange(min=signal.expected_min, max=signal.expected_max)


def _is_missing(signal: BenchSignal) -> bool:
    return signal.quality == BenchSignalQuality.MISSING or signal.value is None


def _is_stale(signal: BenchSignal, *, now: datetime, stale_after_seconds: int) -> bool:
    if signal.quality in {BenchSignalQuality.STALE, BenchSignalQuality.BAD}:
        return True
    if signal.timestamp is not None:
        age_seconds = (now - signal.timestamp).total_seconds()
        return age_seconds > stale_after_seconds
    return False


def _is_numeric(value: float | int | bool | str | None) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _is_fault(signal: BenchSignal) -> bool:
    if not _is_numeric(signal.value):
        return False
    numeric_value = float(signal.value)
    if signal.expected_min is not None and numeric_value < signal.expected_min:
        return True
    return signal.expected_max is not None and numeric_value > signal.expected_max


def _is_warning(signal: BenchSignal) -> bool:
    if not _is_numeric(signal.value):
        return False
    numeric_value = float(signal.value)
    return _near_boundary(
        numeric_value,
        expected_min=signal.expected_min,
        expected_max=signal.expected_max,
    )


def _range_width(expected_min: float, expected_max: float) -> float:
    return expected_max - expected_min


def _near_boundary(
    value: float,
    *,
    expected_min: float | None,
    expected_max: float | None,
) -> bool:
    if expected_min is not None and expected_max is not None:
        width = _range_width(expected_min, expected_max)
        warning_band = width * _WARNING_BAND_FRACTION
        return value <= expected_min + warning_band or value >= expected_max - warning_band

    if expected_min is not None and expected_max is None:
        if expected_min == 0:
            return 0.0 <= value <= _ABSOLUTE_WARNING_BAND
        upper = expected_min * (1.0 + _WARNING_BAND_FRACTION)
        return expected_min <= value <= upper

    if expected_max is not None and expected_min is None:
        if expected_max == 0:
            return expected_max - _ABSOLUTE_WARNING_BAND <= value <= expected_max
        lower = expected_max * (1.0 - _WARNING_BAND_FRACTION)
        return lower <= value <= expected_max

    return False