"""Recorded TagFrame playback — demo safety net when live sim hiccups.

Loads a JSONL capture of TagFrames and replays them into the runtime gateway
on a deterministic clock. Not used for diagnosis logic — only for ingest timing.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Awaitable, Callable, Iterator

from app.schemas.tag_frame import TagFrame

OnFrame = Callable[[TagFrame], Awaitable[None]]


def load_recording(path: Path) -> list[dict[str, Any]]:
    """Load JSONL or JSON-array recording of TagFrame-like dicts."""
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        return []
    if text.startswith("["):
        data = json.loads(text)
        if not isinstance(data, list):
            raise ValueError("recording JSON root must be an array")
        return [frame for frame in data if isinstance(frame, dict)]
    frames: list[dict[str, Any]] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        obj = json.loads(line)
        if isinstance(obj, dict):
            frames.append(obj)
    return frames


def iter_recording(path: Path) -> Iterator[dict[str, Any]]:
    yield from load_recording(path)


def resolve_recording_path(sample_data_dir: Path, recording_id: str) -> Path:
    """Resolve recording_id to a JSONL under sample-data .../recordings/."""
    recordings_dir = sample_data_dir / "recordings"
    candidates = [
        recordings_dir / recording_id,
        recordings_dir / f"{recording_id}.jsonl",
        recordings_dir / f"{recording_id}.json",
    ]
    for path in candidates:
        if path.exists() and path.is_file():
            return path
    raise FileNotFoundError(
        f"Recording '{recording_id}' not found under {recordings_dir}"
    )


def frame_dict_to_tag_frame(raw: dict[str, Any]) -> TagFrame:
    """Coerce a recording dict into a TagFrame (fills defaults for demos)."""
    payload = dict(raw)
    if "source" not in payload:
        payload["source"] = "simulator"
    return TagFrame.model_validate(payload)


async def replay_recording(
    path: Path,
    on_frame: OnFrame,
    *,
    realtime: bool = False,
) -> dict[str, Any]:
    """Feed recording frames into on_frame.

    When realtime=False (default for tests), frames are delivered instantly in order.
    When realtime=True, sleeps by inter-frame timestamp deltas (capped).
    """
    import asyncio

    frames = load_recording(path)
    delivered = 0
    prev_ts: datetime | None = None

    for raw in frames:
        frame = frame_dict_to_tag_frame(raw)
        if realtime and prev_ts is not None:
            delta = (frame.timestamp - prev_ts).total_seconds()
            if 0 < delta < 30:
                await asyncio.sleep(delta)
        await on_frame(frame)
        delivered += 1
        prev_ts = frame.timestamp

    return {
        "recording": path.name,
        "frames_delivered": delivered,
        "realtime": realtime,
    }
