"""Batch planner unit tests."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from gateway.modbus.batch_planner import BatchPlanner, PlannedTag, PlannerLimits, plan_blocks, tags_from_tag_map
from gateway.modbus_poller import build_poll_plan

REPO_ROOT = Path(__file__).resolve().parents[3]
TAG_MAP = json.loads((REPO_ROOT / "packages/sample-data/demo-microgrid/tag_map.json").read_text(encoding="utf-8"))


def tag(name: str, address: int, width: int = 1, table: str = "holding") -> PlannedTag:
    return PlannedTag(name, "A-1", "", address, width, table, "uint16" if width == 1 else "float32_be")


def test_demo_tag_map_is_one_request_per_scan():
    blocks = build_poll_plan(TAG_MAP)
    assert len(blocks) == 1, "the demo map is one contiguous block 0..41 (was 21 requests)"
    block = blocks[0]
    assert (block.function, block.start, block.count) == (3, 0, 41)
    assert len(block.tags) == 23


def test_demo_tag_addresses_are_zero_based():
    _, per_source = tags_from_tag_map(TAG_MAP)
    by_tag = {t.tag_id: t for tags in per_source.values() for t in tags}
    assert by_tag["PV_101_V"].address == 0
    assert by_tag["PV_101_I"].address == 2
    assert by_tag["VFD_V"].address == 24
    assert by_tag["MOTOR_301_CURRENT"].address == 26
    assert by_tag["MOTOR_301_TEMP"].address == 40


def test_21_contiguous_tags_one_request():
    tags = [tag(f"T{i}", i * 2, 2) for i in range(21)]
    blocks = plan_blocks("s", 1, tags)
    assert [(b.start, b.count) for b in blocks] == [(0, 42)]


def test_gap_threshold():
    tags = [tag("A", 0), tag("B", 9), tag("C", 30)]
    blocks = plan_blocks("s", 1, tags, limits=PlannerLimits(max_gap=8))
    assert [(b.start, b.count) for b in blocks] == [(0, 10), (30, 1)]
    blocks = plan_blocks("s", 1, tags, limits=PlannerLimits(max_gap=0))
    assert len(blocks) == 3


def test_125_register_limit_and_2000_bit_limit():
    tags = [tag(f"R{i}", i) for i in range(300)]
    blocks = plan_blocks("s", 1, tags)
    assert [b.count for b in blocks] == [125, 125, 50]
    coils = [tag(f"C{i}", i, table="coil") for i in range(2500)]
    blocks = plan_blocks("s", 1, coils)
    assert [(b.function, b.count) for b in blocks] == [(1, 2000), (1, 500)]
    assert all(b.request().function == 1 for b in blocks)


def test_tables_never_merge():
    blocks = plan_blocks("s", 1, [tag("H", 0), tag("I", 1, table="input")])
    assert sorted(b.function for b in blocks) == [3, 4]


def test_exception_02_split_is_remembered_then_marks_unreadable():
    planner = BatchPlanner("s", 1, [tag("A", 0), tag("B", 4), tag("C", 8), tag("D", 12)])
    (block,) = planner.blocks
    assert planner.split(block) is True
    assert [(b.start, b.count) for b in planner.blocks] == [(0, 5), (8, 5)]
    # the split survives a re-plan (e.g. next scan)
    assert [(b.start, b.count) for b in planner._replan()] == [(0, 5), (8, 5)]
    single = BatchPlanner("s", 1, [tag("A", 0)])
    (only,) = single.blocks
    assert single.split(only) is False
    assert single.is_unreadable(only)


def test_width_over_limit_rejected():
    with pytest.raises(ValueError):
        plan_blocks("s", 1, [tag("BIG", 0, 126)])
