"""Transfer entropy with effective-TE bias correction (Domain S). Offline only.

effective_TE(Y->X) = TE(Y->X) - TE(Y_surrogate->X)
Surrogates are shuffled series removing finite-size bias (Schreiber; RTransferEntropy /
Dimpfl-Peter approach). Output: directional edge candidates -> engineer gate.
"""
from __future__ import annotations

import numpy as np


def transfer_entropy(x: np.ndarray, y: np.ndarray, lag: int = 1) -> float:
    """Scaffold TE estimate. Real impl: bin + conditional entropy + surrogate correction."""
    return 0.0


def effective_te(x: np.ndarray, y: np.ndarray, n_surrogates: int = 100) -> float:
    """effective_TE = TE(Y->X) - mean(TE(Y_shuffled->X))."""
    te = transfer_entropy(x, y)
    rng = np.random.default_rng(0)
    surr = np.mean([transfer_entropy(x, rng.permutation(y)) for _ in range(n_surrogates)])
    return float(te - surr)
