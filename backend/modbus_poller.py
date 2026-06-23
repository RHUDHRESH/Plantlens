import asyncio
import platform
from datetime import datetime, timezone
from typing import Awaitable, Callable, Optional

from pymodbus.client import AsyncModbusSerialClient
from pymodbus.exceptions import ModbusException

from model_loader import get_model
from tag_decoder import TagFrame, make_tag_frame


class PollerState:
    def __init__(self):
        self.connected: bool = False
        self.ok_count: int = 0
        self.error_count: int = 0
        self.last_frames: dict[str, TagFrame] = {}
        self.last_poll_ts: Optional[str] = None


_state = PollerState()
_client: Optional[AsyncModbusSerialClient] = None


class ModbusConfig:
    port: str = 'COM3' if platform.system() == 'Windows' else '/dev/ttyUSB0'
    baudrate: int = 9600
    parity: str = 'N'
    stopbits: int = 1
    bytesize: int = 8
    slave_id: int = 1
    poll_hz: float = 10.0
    stale_threshold_s: float = 3.0


config = ModbusConfig()

_on_frames: Optional[Callable[[dict[str, TagFrame]], Awaitable[None]]] = None
_on_status: Optional[Callable[[dict], Awaitable[None]]] = None


def set_callbacks(on_frames, on_status):
    global _on_frames, _on_status
    _on_frames = on_frames
    _on_status = on_status


async def _read_all_registers() -> list[int] | None:
    """Read all 42 registers in a single Modbus FC04 call."""
    global _client

    if _client is None or not _client.connected:
        return None

    try:
        result = await _client.read_input_registers(
            address=0,
            count=42,
            slave=config.slave_id,
        )

        if result.isError():
            return None

        return result.registers

    except (ModbusException, AttributeError, OSError, Exception):
        return None


def _build_frames_from_registers(registers: list[int] | None) -> dict[str, TagFrame]:
    """Split the 42-register block into pairs and decode each tag."""
    model = get_model()
    frames: dict[str, TagFrame] = {}

    for tag_def in model.tag_list:
        addr = tag_def.channel_ref.get('address', 0)

        if registers is None:
            frame = make_tag_frame(tag_def, None, error=True)
        elif addr + 1 >= len(registers):
            frame = make_tag_frame(tag_def, None, error=True)
        else:
            raw_pair = [registers[addr], registers[addr + 1]]
            frame = make_tag_frame(tag_def, raw_pair)

        frames[tag_def.tag_id] = frame

    return frames


async def poll_loop():
    """Single asyncio task that owns the Modbus client."""
    global _client, _state

    poll_interval = 1.0 / config.poll_hz

    while True:
        _client = AsyncModbusSerialClient(
            port=config.port,
            baudrate=config.baudrate,
            parity=config.parity,
            stopbits=config.stopbits,
            bytesize=config.bytesize,
            timeout=1.0,
        )

        try:
            await _client.connect()
            _state.connected = _client.connected

            if _on_status:
                await _on_status({
                    'type': 'CONN_STATUS',
                    'connected': _state.connected,
                    'port': config.port,
                    'ok_count': _state.ok_count,
                    'error_count': _state.error_count,
                })

            while True:
                t_start = asyncio.get_event_loop().time()

                registers = await _read_all_registers()
                frames = _build_frames_from_registers(registers)

                _state.last_frames = frames
                _state.last_poll_ts = datetime.now(timezone.utc).isoformat()

                if registers is not None:
                    _state.ok_count += 1
                    _state.connected = True
                else:
                    _state.error_count += 1
                    _state.connected = False
                    if _on_status:
                        await _on_status({
                            'type': 'CONN_STATUS',
                            'connected': False,
                            'port': config.port,
                            'ok_count': _state.ok_count,
                            'error_count': _state.error_count,
                        })

                if _on_frames:
                    await _on_frames(frames)

                elapsed = asyncio.get_event_loop().time() - t_start
                sleep_for = max(0, poll_interval - elapsed)
                await asyncio.sleep(sleep_for)

        except Exception:
            _state.connected = False
            _state.error_count += 1

            if _on_status:
                await _on_status({
                    'type': 'CONN_STATUS',
                    'connected': False,
                    'port': config.port,
                    'ok_count': _state.ok_count,
                    'error_count': _state.error_count,
                })

            await asyncio.sleep(min(8, 0.5 * (2 ** min(_state.error_count, 5))))

        finally:
            if _client:
                _client.close()


def get_state() -> PollerState:
    return _state