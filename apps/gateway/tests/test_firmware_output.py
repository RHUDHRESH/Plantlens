"""Compile the Arduino sketches on the host (g++ + stub Arduino.h) and parse their serial output
with the real gateway framer/decoder. Proves firmware and parser agree; skipped without g++."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

from gateway.line.framer import LineFramer
from gateway.line.protocols import LineDecoder, LineTagSpec

REPO_ROOT = Path(__file__).resolve().parents[3]
HARNESS = Path(__file__).parent / "firmware_harness"
UNO = REPO_ROOT / "arduino/uno_plain/plantlens_uno/plantlens_uno.ino"
UNO_Q = REPO_ROOT / "arduino/uno_q/mcu/plantlens_acquisition.ino"
CXX = shutil.which("g++") or shutil.which("clang++")

pytestmark = pytest.mark.skipif(CXX is None, reason="no C++ compiler available")


def run_sketch(sketch: Path, tmp_path: Path, seconds: float = 3.0, adc: int | None = None) -> tuple[bytes, int]:
    exe = tmp_path / sketch.stem
    subprocess.run(
        [CXX, "-std=c++17", "-O1", "-w", f"-I{HARNESS}", f'-DSKETCH="{sketch}"', "-x", "c++", str(HARNESS / "harness.cpp"), "-o", str(exe)],
        check=True,
        capture_output=True,
        timeout=120,
    )
    args = [str(exe), str(seconds)] + ([str(adc)] if adc is not None else [])
    result = subprocess.run(args, check=True, capture_output=True, timeout=60)
    blocked = int(result.stderr.decode().strip().split("=")[1])
    return result.stdout, blocked


def decode_all(data: bytes, decoder: LineDecoder) -> list:
    framer = LineFramer()
    readings = []
    for line in framer.feed(data):
        readings.extend(decoder.decode(line))
    return readings


def spec(tag: str) -> LineTagSpec:
    return LineTagSpec(tag, "UNO-1", "V")


def test_plain_uno_sketch_emits_valid_pl1_at_rate_without_blocking(tmp_path: Path):
    out, blocked = run_sketch(UNO, tmp_path, seconds=3.0)
    assert out.startswith(b"#PLANTLENS READY v1")
    tags = {t: spec(t) for t in ("VIB_X", "MOTOR_301_CURRENT", "BUS_101_V", "T4", "A_4", "A_5")}
    cols = {"vib": "VIB_X", "current": "MOTOR_301_CURRENT", "voltage": "BUS_101_V", "temp": "T4", "aux4": "A_4", "aux5": "A_5"}
    decoder = LineDecoder(tags, column_map=cols)
    readings = decode_all(out, decoder)
    stats = decoder.stats
    assert stats.checksum_failures == 0 and stats.rejected_lines == 0, stats.as_dict()
    assert 55 <= stats.accepted_lines <= 61  # 20 Hz for 3 s
    assert len(readings) == 6 * stats.accepted_lines
    assert all(r.quality == "GOOD" and 0.0 <= r.value <= 5.0 for r in readings)
    assert blocked == 0, "loop() must never block on Serial"


def test_plain_uno_marks_saturated_adc_bad(tmp_path: Path):
    out, _ = run_sketch(UNO, tmp_path, seconds=0.5, adc=1023)
    decoder = LineDecoder({"VIB_X": spec("VIB_X")}, column_map={"vib": "VIB_X"})
    readings = decode_all(out, decoder)
    assert readings and all(r.quality == "BAD" and r.value == 5.0 for r in readings)


def test_uno_q_sketch_emits_header_driven_csv_the_gateway_parses(tmp_path: Path):
    out, blocked = run_sketch(UNO_Q, tmp_path, seconds=6.0)
    assert out.startswith(b"#PLANTLENS READY v1")
    header = b"seq,t_ms,vib_mean,vib_p2p,current_mean,voltage_mean,airflow_mean,rpm_hz,quality"
    assert out.count(header) >= 2, "header must be re-emitted periodically"
    tags = {t: spec(t) for t in ("VIB_MEAN", "VIB_X", "MOTOR_301_CURRENT")}
    decoder = LineDecoder(tags, column_map={"vib_mean": "VIB_MEAN", "vib_p2p": "VIB_X", "current_mean": "MOTOR_301_CURRENT"})
    readings = decode_all(out, decoder)
    stats = decoder.stats
    assert stats.accepted_lines >= 25 * 6 * 0.9, stats.as_dict()
    assert stats.rejected.get("csv_width", 0) == 0
    assert {r.tag_id for r in readings} == set(tags)
    assert blocked == 0
