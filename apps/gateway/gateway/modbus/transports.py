"""Minimal read-only Modbus masters: RTU over :class:`SerialLink` and TCP over asyncio streams.

Both only know how to encode FC01-04 (``encode_*`` re-checks the whitelist), and both classify
failures precisely so diagnostics can tell a dead slave (timeout) from a noisy bus (CRC), a
misconfigured map (exception response) and an unplugged adapter (link).
"""

from __future__ import annotations

import asyncio
import contextlib
import struct
import time

from gateway.modbus.guard import BIT_FUNCTIONS, ReadRequest, check_function
from gateway.transport.serial_link import LinkDown, SerialLink


class ModbusError(Exception):
    kind = "error"


class ModbusTimeout(ModbusError):
    kind = "timeout"


class ModbusCrcError(ModbusError):
    kind = "crc"


class ModbusFrameError(ModbusError):
    kind = "frame"


class ModbusLinkError(ModbusError):
    kind = "link"


class ModbusExceptionResponse(ModbusError):
    kind = "exception"

    def __init__(self, function: int, code: int) -> None:
        self.function = function
        self.code = code
        super().__init__(f"FC{function:02d} exception code {code:02d}")


ILLEGAL_DATA_ADDRESS = 0x02


def crc16(data: bytes) -> int:
    crc = 0xFFFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            crc = (crc >> 1) ^ 0xA001 if crc & 1 else crc >> 1
    return crc


def payload_bytes(request: ReadRequest) -> int:
    if request.function in BIT_FUNCTIONS:
        return (request.count + 7) // 8
    return request.count * 2


def encode_pdu(request: ReadRequest) -> bytes:
    check_function(request.function)
    return struct.pack(">BHH", request.function, request.address, request.count)


def encode_rtu(request: ReadRequest) -> bytes:
    body = bytes([request.unit]) + encode_pdu(request)
    return body + struct.pack("<H", crc16(body))


def decode_payload(request: ReadRequest, payload: bytes) -> list[int]:
    if len(payload) != payload_bytes(request):
        raise ModbusFrameError(f"byte count {len(payload)} != expected {payload_bytes(request)}")
    if request.function in BIT_FUNCTIONS:
        bits = [(payload[i // 8] >> (i % 8)) & 1 for i in range(request.count)]
        return bits
    return list(struct.unpack(f">{request.count}H", payload))


def t35_seconds(baudrate: int) -> float:
    """Modbus RTU inter-frame silence (3.5 chars of 11 bits; fixed 1.75 ms above 19200 baud)."""
    if baudrate > 19200:
        return 0.00175
    return 3.5 * 11.0 / baudrate


class RtuTransport:
    def __init__(
        self,
        link: SerialLink,
        *,
        baudrate: int,
        inter_frame_s: float | None = None,
        local_echo: bool = False,
    ) -> None:
        self.link = link
        self.baudrate = baudrate
        self.inter_frame_s = t35_seconds(baudrate) if inter_frame_s is None else inter_frame_s
        self.local_echo = local_echo
        self._lock = asyncio.Lock()
        self._last_activity = 0.0
        self._quiet_until = 0.0
        self.late_reply_guard_s = max(4 * self.inter_frame_s, 0.02)
        self.requests = 0

    @property
    def reconnects(self) -> int:
        return self.link.state.reconnect_count

    @property
    def connected(self) -> bool:
        return self.link.connected

    def _char_s(self) -> float:
        return 11.0 / self.baudrate

    async def read(self, request: ReadRequest, *, timeout: float) -> list[int]:
        frame = encode_rtu(request)
        expected = 5 + payload_bytes(request)
        async with self._lock:
            # t3.5 silence before every request; after a failed exchange also wait out a possible
            # late reply so it cannot be mistaken for the answer to this request.
            gap = max(self._last_activity + self.inter_frame_s, self._quiet_until) - time.monotonic()
            if gap > 0:
                await asyncio.sleep(gap)
            self.link.discard_input()
            try:
                await self.link.write(frame)
            except LinkDown as exc:
                raise ModbusLinkError(str(exc)) from exc
            self.requests += 1
            wire_s = (len(frame) + expected) * self._char_s()
            deadline = time.monotonic() + timeout + wire_s
            buf = bytearray()
            echo = len(frame) if self.local_echo else 0
            failed = True
            try:
                while True:
                    body = buf[echo:]
                    need = 5 if len(body) >= 2 and body[1] & 0x80 else expected
                    if len(body) >= need:
                        break
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        if not body:
                            raise ModbusTimeout(f"unit {request.unit}: no response in {timeout * 1000:.0f} ms")
                        raise ModbusFrameError(f"unit {request.unit}: truncated response ({len(body)}/{need} bytes)")
                    try:
                        buf += await self.link.read(remaining)
                    except LinkDown as exc:
                        raise ModbusLinkError(str(exc)) from exc
                failed = False
            finally:
                self._last_activity = time.monotonic()
                if failed:
                    self._quiet_until = self._last_activity + self.late_reply_guard_s
        return self._parse(request, bytes(buf[echo : echo + need]))

    @staticmethod
    def _parse(request: ReadRequest, frame: bytes) -> list[int]:
        wire_crc = struct.unpack("<H", frame[-2:])[0]
        if crc16(frame[:-2]) != wire_crc:
            raise ModbusCrcError(f"unit {request.unit}: CRC mismatch")
        if frame[0] != request.unit:
            raise ModbusFrameError(f"reply from unit {frame[0]}, expected {request.unit}")
        function = frame[1]
        if function == request.function | 0x80:
            raise ModbusExceptionResponse(request.function, frame[2])
        if function != request.function:
            raise ModbusFrameError(f"reply FC{function:02d}, expected FC{request.function:02d}")
        if frame[2] != payload_bytes(request):
            raise ModbusFrameError("byte count mismatch")
        return decode_payload(request, frame[3:-2])

    async def close(self) -> None:
        await self.link.stop()


class TcpTransport:
    def __init__(self, host: str, port: int, *, connect_timeout: float = 1.0) -> None:
        self.host = host
        self.port = port
        self.connect_timeout = connect_timeout
        self._reader: asyncio.StreamReader | None = None
        self._writer: asyncio.StreamWriter | None = None
        self._lock = asyncio.Lock()
        self._tid = 0
        self._ever_connected = False
        self.reconnects = 0
        self.requests = 0

    @property
    def connected(self) -> bool:
        return self._writer is not None and not self._writer.is_closing()

    async def _ensure(self) -> tuple[asyncio.StreamReader, asyncio.StreamWriter]:
        if self._reader is not None and self._writer is not None and not self._writer.is_closing():
            return self._reader, self._writer
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(self.host, self.port), self.connect_timeout
            )
        except (OSError, TimeoutError) as exc:
            raise ModbusLinkError(f"connect {self.host}:{self.port} failed: {exc!r}") from exc
        if self._ever_connected:
            self.reconnects += 1
        self._ever_connected = True
        self._reader, self._writer = reader, writer
        return reader, writer

    async def _drop(self) -> None:
        writer = self._writer
        self._reader = self._writer = None
        if writer is not None:
            writer.close()
            with contextlib.suppress(Exception):
                await asyncio.wait_for(writer.wait_closed(), 0.5)

    async def read(self, request: ReadRequest, *, timeout: float) -> list[int]:
        pdu = encode_pdu(request)
        async with self._lock:
            reader, writer = await self._ensure()
            self._tid = (self._tid + 1) & 0xFFFF
            tid = self._tid
            try:
                writer.write(struct.pack(">HHHB", tid, 0, len(pdu) + 1, request.unit) + pdu)
                await writer.drain()
                self.requests += 1
                header = await asyncio.wait_for(reader.readexactly(7), timeout)
                rtid, proto, length, unit = struct.unpack(">HHHB", header)
                if proto != 0 or not 2 <= length <= 260:
                    raise ModbusFrameError("bad MBAP header")
                body = await asyncio.wait_for(reader.readexactly(length - 1), timeout)
            except TimeoutError as exc:
                await self._drop()  # late replies would desynchronise the stream
                raise ModbusTimeout(f"unit {request.unit}: no response in {timeout * 1000:.0f} ms") from exc
            except ModbusFrameError:
                await self._drop()
                raise
            except (OSError, asyncio.IncompleteReadError) as exc:
                await self._drop()
                raise ModbusLinkError(f"{type(exc).__name__}: {exc}") from exc
        if rtid != tid or unit != request.unit:
            await self._drop()
            raise ModbusFrameError(f"reply tid/unit {rtid}/{unit} != {tid}/{request.unit}")
        function = body[0]
        if function == request.function | 0x80:
            raise ModbusExceptionResponse(request.function, body[1] if len(body) > 1 else 0)
        if function != request.function or len(body) < 2 or body[1] != len(body) - 2:
            raise ModbusFrameError("malformed response PDU")
        return decode_payload(request, body[2:])

    async def close(self) -> None:
        await self._drop()
