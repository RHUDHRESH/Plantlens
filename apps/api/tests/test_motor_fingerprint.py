from app.edge_research.motor_fingerprint import ElectricalSample, MotorFingerprintModel


SAMPLES = (
    ElectricalSample(27.15444, 2.26244, 61.43538),
    ElectricalSample(26.91980, 15.39559, 413.48633),
    ElectricalSample(26.99155, 24.25614, 656.78320),
)


def test_fingerprint_recognizes_a_learned_load_mode():
    model = MotorFingerprintModel.fit(SAMPLES)
    result = model.infer(ElectricalSample(26.95, 15.2, 409.0))

    assert result.decision == "KNOWN_SIGNATURE"
    assert result.matched_prototype == "load_mode_2"
    assert result.similarity > 0.95
    assert result.confidence > 0.85
    assert len(result.model_sha256) == 64


def test_fingerprint_abstains_when_vi_physics_does_not_match():
    model = MotorFingerprintModel.fit(SAMPLES)
    result = model.infer(ElectricalSample(27.0, 15.0, 40.0))

    assert result.decision == "ABSTAIN_MAPPING_OR_SENSOR"
    assert result.power_balance_error > 0.10


def test_fingerprint_reports_unknown_off_manifold_signature():
    model = MotorFingerprintModel.fit(SAMPLES)
    result = model.infer(ElectricalSample(18.0, 40.0, 720.0))

    assert result.decision == "UNKNOWN_SIGNATURE"
    assert result.novelty_score > 0.8
