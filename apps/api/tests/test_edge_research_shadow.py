import pytest

from app.edge_research.factorial_shadow import (
    ApprovedFaultEdge,
    EdgeEpoch,
    FactorialShadowEngine,
    FaultEvidenceSpec,
)


def _engine() -> FactorialShadowEngine:
    return FactorialShadowEngine(
        [
            FaultEvidenceSpec("overload", {"current_z": 1.8, "temp_slope_z": 0.8}, {"rpm_z": 0.2}),
            FaultEvidenceSpec("imbalance", {"vibration_1x_z": 2.0}, {"current_imbalance_z": 0.5}),
            FaultEvidenceSpec("sensor_fault", {"mapping_error": 2.5}, {}),
        ],
        beam_width=8,
        novelty_threshold=2.0,
        accept_probability=0.6,
    )


def test_shadow_engine_is_deterministic_across_replay():
    epoch = EdgeEpoch(
        mode="STEADY_HIGH",
        features={"current_z": 2.0, "temp_slope_z": 1.0, "rpm_z": -0.5, "vibration_1x_z": 0.1, "current_imbalance_z": 0.0, "mapping_error": 0.0},
        quality={"current_z": 1.0, "temp_slope_z": 1.0, "rpm_z": 1.0, "vibration_1x_z": 1.0, "current_imbalance_z": 1.0, "mapping_error": 1.0},
    )
    first_engine = _engine()
    second_engine = _engine()
    for _ in range(3):
        first = first_engine.update(epoch)
        second = second_engine.update(epoch)
    assert first == second
    assert first.top_states[0].faults == ("overload",)


def test_low_quality_abstains_before_fault_label():
    epoch = EdgeEpoch("STEADY_HIGH", {"current_z": 5.0}, {"current_z": 0.2})
    result = _engine().update(epoch)
    assert result.decision == "INSUFFICIENT_DATA"
    assert "INSUFFICIENT_DATA" in result.abstention_reasons


def test_novel_observation_routes_to_unknown():
    epoch = EdgeEpoch("STEADY_HIGH", {"current_z": 20.0}, {"current_z": 1.0})
    result = _engine().update(epoch, healthy_center={"current_z": 0.0}, healthy_scale={"current_z": 1.0})
    assert result.decision == "UNKNOWN_FAULT"


def test_factorial_state_can_represent_compound_fault():
    engine = _engine()
    epoch = EdgeEpoch(
        "STEADY_HIGH",
        {"current_z": 3.0, "temp_slope_z": 1.0, "rpm_z": 0.0, "vibration_1x_z": 3.0, "current_imbalance_z": 0.0, "mapping_error": 0.0},
        {name: 1.0 for name in ("current_z", "temp_slope_z", "rpm_z", "vibration_1x_z", "current_imbalance_z", "mapping_error")},
    )
    for _ in range(4):
        result = engine.update(epoch)
    assert result.top_states[0].faults == ("overload", "imbalance")


def test_engine_bounds_fault_count_and_beam():
    specs = [FaultEvidenceSpec(f"f{i}", {f"x{i}": 1.0}, {}) for i in range(10)]
    engine = FactorialShadowEngine(specs, beam_width=16, maximum_active_faults=3)
    epoch = EdgeEpoch("STEADY", {f"x{i}": 2.0 for i in range(10)}, {f"x{i}": 1.0 for i in range(10)})
    result = engine.update(epoch)
    assert len(result.top_states) <= 5
    assert all(len(state.faults) <= 3 for state in result.top_states)


def test_fault_dag_rejects_unapproved_and_cyclic_edges():
    specs = [FaultEvidenceSpec("cause", {}, {}), FaultEvidenceSpec("effect", {}, {})]
    with pytest.raises(ValueError, match="unapproved"):
        FactorialShadowEngine(
            specs, approved_edges=[ApprovedFaultEdge("cause", "effect", approved=False)]
        )
    with pytest.raises(ValueError, match="acyclic"):
        FactorialShadowEngine(
            specs,
            approved_edges=[
                ApprovedFaultEdge("cause", "effect"),
                ApprovedFaultEdge("effect", "cause"),
            ],
        )


def test_explanation_receipt_contains_evidence_transition_and_causal_path():
    engine = FactorialShadowEngine(
        [
            FaultEvidenceSpec("overload", {"current_z": 2.0}, {}),
            FaultEvidenceSpec("thermal_stress", {"temperature_z": 2.0}, {}),
        ],
        approved_edges=[ApprovedFaultEdge("overload", "thermal_stress", weight=0.8)],
        accept_probability=0.5,
    )
    epoch = EdgeEpoch(
        "STEADY_HIGH",
        {"current_z": 3.0, "temperature_z": 3.0},
        {"current_z": 1.0, "temperature_z": 1.0},
    )
    for _ in range(4):
        result = engine.update(epoch)
    receipt = result.explanations[0]
    assert receipt.faults == ("overload", "thermal_stress")
    assert receipt.causal_edges == ("overload->thermal_stress",)
    assert any(item.feature == "current_z" and item.kind == "support" for item in receipt.evidence)
    assert "added=" in receipt.transition


def test_dag_penalizes_orphan_effect_candidate():
    specs = [
        FaultEvidenceSpec("cause", {"cause_feature": 1.0}, {}),
        FaultEvidenceSpec("effect", {"effect_feature": 1.0}, {}),
    ]
    engine = FactorialShadowEngine(
        specs,
        approved_edges=[ApprovedFaultEdge("cause", "effect", weight=2.0)],
        beam_width=4,
    )
    result = engine.update(
        EdgeEpoch(
            "STEADY",
            {"cause_feature": 0.0, "effect_feature": 2.0},
            {"cause_feature": 1.0, "effect_feature": 1.0},
        )
    )
    orphan = next(state for state in result.top_states if state.faults == ("effect",))
    healthy = next(state for state in result.top_states if not state.faults)
    assert orphan.score < healthy.score
