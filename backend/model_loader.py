import json
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

DATA_DIR = Path(__file__).parent / 'data'


class TagDefinition(BaseModel):
    tag_id: str
    description: str
    unit: str
    equipment_id: str
    zone: str
    channel_ref: dict
    word_order: str
    scale: float
    offset: float
    normal_min: Optional[float]
    normal_max: Optional[float]
    alarm_high: Optional[float]
    alarm_low: Optional[float]
    alarm_priority: int
    hihi: Optional[float]
    lolo: Optional[float]


class EdgeDefinition(BaseModel):
    id: str
    cause: str
    effect: str
    propagation_min_s: float
    propagation_max_s: float
    confidence_prior: float
    approved_by: str
    approved_date: str
    source_reference: str


class ModelBundle(BaseModel):
    tag_list: list[TagDefinition]
    graph_nodes: list[dict]
    graph_edges: list[EdgeDefinition]
    plant: dict
    plant_layout: dict
    templates: dict
    action_envelope: dict


_bundle: ModelBundle | None = None


def load_model() -> ModelBundle:
    """Load and validate all model files. Raises ValueError on schema errors."""
    global _bundle

    try:
        with open(DATA_DIR / 'tag_list.json') as f:
            tag_list_raw = json.load(f)
        with open(DATA_DIR / 'graph.json') as f:
            graph_raw = json.load(f)
        with open(DATA_DIR / 'plant.json') as f:
            plant_raw = json.load(f)
        with open(DATA_DIR / 'plant_layout.json') as f:
            layout_raw = json.load(f)
        with open(DATA_DIR / 'templates.json') as f:
            templates_raw = json.load(f)
        with open(DATA_DIR / 'action_envelope.json') as f:
            actions_raw = json.load(f)
    except FileNotFoundError as e:
        raise ValueError(f"Model file missing: {e.filename}. Run commissioning first.") from e

    tag_list = [TagDefinition(**t) for t in tag_list_raw['tags']]
    edges = [EdgeDefinition(**e) for e in graph_raw['edges']]

    _bundle = ModelBundle(
        tag_list=tag_list,
        graph_nodes=graph_raw['nodes'],
        graph_edges=edges,
        plant=plant_raw,
        plant_layout=layout_raw,
        templates=templates_raw,
        action_envelope=actions_raw,
    )

    print(f"[model_loader] Loaded {len(tag_list)} tags, {len(edges)} causal edges.")
    return _bundle


def get_model() -> ModelBundle:
    if _bundle is None:
        raise RuntimeError("Model not loaded. Call load_model() at startup.")
    return _bundle


def get_tag(tag_id: str) -> TagDefinition | None:
    return next((t for t in get_model().tag_list if t.tag_id == tag_id), None)