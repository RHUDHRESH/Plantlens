"""Tests for recorded TagFrame playback helper."""

from __future__ import annotations

import json
from pathlib import Path

from app.runtime.simulator.recorded_playback import iter_recording, load_recording


def test_load_jsonl_recording(tmp_path: Path) -> None:
    path = tmp_path / "run.jsonl"
    path.write_text(
        "\n".join(
            [
                json.dumps({"tag_id": "BUS_101_V", "value": 48.0, "quality": "GOOD"}),
                json.dumps({"tag_id": "MOTOR_301_CURRENT", "value": 3.4, "quality": "GOOD"}),
            ]
        ),
        encoding="utf-8",
    )
    frames = load_recording(path)
    assert len(frames) == 2
    assert frames[0]["tag_id"] == "BUS_101_V"
    assert list(iter_recording(path))[1]["value"] == 3.4


def test_load_json_array_recording(tmp_path: Path) -> None:
    path = tmp_path / "run.json"
    path.write_text(
        json.dumps([{"tag_id": "PV_101_V", "value": 40.0, "quality": "GOOD"}]),
        encoding="utf-8",
    )
    assert load_recording(path)[0]["tag_id"] == "PV_101_V"
