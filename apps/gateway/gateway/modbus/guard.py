"""Read-only request whitelist (rule R7: the gateway never writes to hardware).

Only FC01 (coils), FC02 (discrete inputs), FC03 (holding registers) and FC04 (input registers)
can be expressed. :class:`ReadRequest` refuses to be constructed with any other function code, and
:class:`ReadOnlyGuard` re-checks every request before it reaches a transport, so a forged object
(e.g. built with ``object.__new__``) is also stopped. Write codes FC05/06/15/16/22/23 raise
:class:`ReadOnlyViolation`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

READ_FUNCTIONS = frozenset({1, 2, 3, 4})
WRITE_FUNCTIONS = frozenset({5, 6, 15, 16, 22, 23})
BIT_FUNCTIONS = frozenset({1, 2})
MAX_REGISTERS = 125
MAX_BITS = 2000

TABLE_TO_FUNCTION = {
    "coil": 1,
    "coils": 1,
    "discrete": 2,
    "discrete_input": 2,
    "discrete_inputs": 2,
    "holding": 3,
    "holding_register": 3,
    "hreg": 3,
    "input": 4,
    "input_register": 4,
    "ireg": 4,
}


class ReadOnlyViolation(PermissionError):
    """Raised when anything other than a Modbus read (FC01-04) is attempted."""


def check_function(function: int) -> None:
    if function not in READ_FUNCTIONS:
        kind = "write" if function in WRITE_FUNCTIONS else "non-read"
        msg = f"Modbus FC{function:02d} is a {kind} function; the gateway is read-only (R7)"
        raise ReadOnlyViolation(msg)


@dataclass(frozen=True, slots=True)
class ReadRequest:
    unit: int
    function: int
    address: int
    count: int

    def __post_init__(self) -> None:
        check_function(self.function)
        limit = MAX_BITS if self.function in BIT_FUNCTIONS else MAX_REGISTERS
        if not 1 <= self.count <= limit:
            msg = f"count {self.count} outside 1..{limit} for FC{self.function:02d}"
            raise ValueError(msg)
        if not 0 <= self.address <= 0xFFFF or self.address + self.count > 0x10000:
            msg = f"address range {self.address}+{self.count} outside 0..65535"
            raise ValueError(msg)
        if not 0 <= self.unit <= 247:
            msg = f"unit id {self.unit} outside 0..247"
            raise ValueError(msg)


class ReadTransport(Protocol):
    async def read(self, request: ReadRequest, *, timeout: float) -> list[int]: ...

    async def close(self) -> None: ...


class ReadOnlyGuard:
    """Wraps a transport; the only path from the scan engine to the wire."""

    def __init__(self, transport: ReadTransport) -> None:
        self._transport = transport
        self.blocked = 0

    @property
    def transport(self) -> ReadTransport:
        return self._transport

    async def read(self, request: ReadRequest, *, timeout: float) -> list[int]:
        function = getattr(request, "function", None)
        if not isinstance(request, ReadRequest) or not isinstance(function, int):
            self.blocked += 1
            raise ReadOnlyViolation(f"not a ReadRequest: {request!r}")
        try:
            check_function(function)
        except ReadOnlyViolation:
            self.blocked += 1
            raise
        return await self._transport.read(request, timeout=timeout)

    def __getattr__(self, name: str) -> object:
        if name.startswith("write"):
            raise ReadOnlyViolation(f"{name} is not available: the gateway is read-only (R7)")
        raise AttributeError(name)

    async def close(self) -> None:
        await self._transport.close()
