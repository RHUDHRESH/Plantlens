from app.edge_research.compact_ensemble import CompactFaultEnsemble, FEATURES


def _quality(value: float = 1.0) -> dict[str, float]:
    return {feature: value for feature in FEATURES}


def test_overload_receipt_is_deterministic_and_explainable():
    model = CompactFaultEnsemble()
    features = {feature: 0.0 for feature in FEATURES}
    features.update(current_z=3.0, power_z=2.0, rpm_drop_z=2.5)
    first = model.infer(features, _quality())
    second = model.infer(features, _quality())
    assert first == second
    assert first.decision == "KNOWN_FAULT"
    assert first.estimates[0].fault_id == "overload"
    assert first.estimates[0].contributors[0][0] in {"current_z", "rpm_drop_z"}


def test_low_quality_abstains_even_with_large_fault_features():
    features = {feature: 5.0 for feature in FEATURES}
    result = CompactFaultEnsemble().infer(features, _quality(0.2))
    assert result.decision == "INSUFFICIENT_DATA"
    assert result.effective_quality < 0.7


def test_novel_feature_routes_to_unknown_fault():
    features = {feature: 0.0 for feature in FEATURES}
    features["vibration_rms_z"] = 12.0
    result = CompactFaultEnsemble().infer(features, _quality())
    assert result.decision == "UNKNOWN_FAULT"
    assert "UNKNOWN_FAULT" in result.abstention_reasons


def test_member_disagreement_is_reported_and_bounded():
    features = {feature: 0.5 for feature in FEATURES}
    result = CompactFaultEnsemble().infer(features, _quality())
    assert all(0.0 <= estimate.probability <= 1.0 for estimate in result.estimates)
    assert all(estimate.disagreement >= 0.0 for estimate in result.estimates)
