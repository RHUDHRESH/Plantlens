from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np


EDGE_DIR = Path(__file__).resolve().parents[1] / "edge_ai"
sys.path.insert(0, str(EDGE_DIR))

from feature_extractor import extract_window_features, feature_order  # noqa: E402


class FeatureExtractorTests(unittest.TestCase):
    def test_feature_order_is_stable(self) -> None:
        self.assertEqual(feature_order(), sorted(feature_order()))
        self.assertGreater(len(feature_order()), 20)

    def test_dominant_frequency(self) -> None:
        sample_rate = 800
        t = np.arange(1600) / sample_rate
        vibration = np.sin(2 * np.pi * 40 * t)
        current = 0.8 + 0.1 * np.sin(2 * np.pi * 40 * t)
        features = extract_window_features(vibration, current, sample_rate).values
        self.assertAlmostEqual(features["vibration_dominant_hz"], 40.0, delta=0.6)

    def test_rejects_bad_shapes(self) -> None:
        with self.assertRaises(ValueError):
            extract_window_features(np.ones(10), np.ones(9), 800)


if __name__ == "__main__":
    unittest.main()
