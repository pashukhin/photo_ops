from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Protocol


@dataclass
class BusMessage:
    body: bytes
    correlation_id: str


class MessagePublisher(Protocol):
    def publish(self, destination: str, message: BusMessage) -> None: ...


class MessageConsumer(Protocol):
    def consume(self, source: str, handler: Callable[[BusMessage], None]) -> None: ...
