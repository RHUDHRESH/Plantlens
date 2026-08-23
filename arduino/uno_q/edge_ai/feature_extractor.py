"""Deterministic time-domain and spectral features for motor fingerprints."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


EPS = 1e-12


@dataclass(frozen=True)
class WindowFeatures:
    values: dict[str, float]

    def vector(self, order: list[str]) -> np.ndarray:
        return np.asarray([self.values[name] for name in order], dtype=np.float64)


def _kurtosis(x: np.ndarray) -> float:
    centered = x - np.mean(x)
    variance = float(np.mean(centered**2))
    if variance <= EPS:
        return 0.0
    return float(np.mean(centered**4) / (variance**2))


def _spectral_features(x: np.ndarray, sample_rate_hz: float, prefix: str) -> dict[str, float]:
    centered = x - np.mean(x)
    spectrum = np.abs(np.fft.rfft(centered)) ** 2
    freqs = np.fft.rfftfreq(centered.size, d=1.0 / sample_rate_hz)
    total = float(np.sum(spectrum)) + EPS

    dominant_idx = int(np.argmax(spectrum[1:]) + 1) if spectrum.size > 1 else 0
    centroid = float(np.sum(freqs * spectrum) / total)

    nyquist = sample_rate_hz / 2.0
    edges = (0.0, 0.15 * nyquist, 0.45 * nyquist, nyquist + EPS)
    bands: list[float] = []
    for low, high in zip(edges[:-1], edges[1:]):
        mask = (freqs >= low) & (freqs < high)
        bands.append(float(np.sum(spectrum[mask]) / total))

    return {
        f"{prefix}_dominant_hz": float(freqs[dominant_idx]),
        f"{prefix}_spectral_centroid_hz": centroid,
        f"{prefix}_band_low": bands[0],
        f"{prefix}_band_mid": bands[1],
        f"{prefix}_band_high": bands[2],
    }


def _channel_features(x: np.ndarray, sample_rate_hz: float, prefix: str) -> dict[str, float]:
    if x.ndim != 1 or x.size < 16:
        raise ValueError(f"{prefix} must contain at least 16 samples")
    if not np.all(np.isfinite(x)):
        raise ValueError(f"{prefix} contains non-finite samples")

    rms = float(np.sqrt(np.mean(x**2)))
    peak = float(np.max(np.abs(x)))
    zero_crossings = float(np.mean(np.diff(np.signbit(x - np.mean(x))) != 0))
    values = {
        f"{prefix}_mean": float(np.mean(x)),
        f"{prefix}_std": float(np.std(x)),
        f"{prefix}_rms": rms,
        f"{prefix}_peak_to_peak": float(np.ptp(x)),
        f"{prefix}_crest_factor": peak / (rms + EPS),
        f"{prefix}_kurtosis": _kurtosis(x),
        f"{prefix}_zero_crossing_rate": zero_crossings,
    }
    values.update(_spectral_features(x, sample_rate_hz, prefix))
    return values


def extract_window_features(
    vibration: np.ndarray,
    current: np.ndarray,
    sample_rate_hz: float,
) -> WindowFeatures:
    vibration = np.asarray(vibration, dtype=np.float64)
    current = np.asarray(current, dtype=np.float64)
    if vibration.size != current.size:
        raise ValueError("vibration and current windows must have equal length")
    if sample_rate_hz <= 0:
        raise ValueError("sample_rate_hz must be positive")

    values = _channel_features(vibration, sample_rate_hz, "vibration")
    values.update(_channel_features(current, sample_rate_hz, "current"))
    return WindowFeatures(values=values)


def feature_order() -> list[str]:
    dummy = extract_window_features(np.zeros(32), np.zeros(32), 32.0)
    return sorted(dummy.values)
