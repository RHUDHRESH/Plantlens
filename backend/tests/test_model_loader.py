from model_loader import get_model, load_model


def test_loads_21_tags():
    bundle = load_model()
    assert len(bundle.tag_list) == 21


def test_graph_edges_loaded():
    bundle = get_model()
    assert len(bundle.graph_edges) >= 3


def test_action_envelope_loaded():
    bundle = get_model()
    assert len(bundle.action_envelope.get('actions', [])) >= 1