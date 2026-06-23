import os

import pytest

os.environ['PLANTLENS_SKIP_POLL'] = '1'

from alarm_engine import reset_state as reset_alarms
from dag_engine import reset_state as reset_dag
from model_loader import load_model


@pytest.fixture(autouse=True)
def reset_pipeline_state():
    load_model()
    reset_alarms()
    reset_dag()
    yield
    reset_alarms()
    reset_dag()