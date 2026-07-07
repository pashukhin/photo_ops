from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Protocol


@dataclass
class BusMessage:
    body: bytes
    correlation_id: str
    # Broker headers (e.g. the bounded-retry ``x-attempt`` counter, photo_ops-0od).
    # Optional so existing constructions and the in-memory bus are unaffected.
    headers: dict | None = None


class MessagePublisher(Protocol):
    def publish(self, destination: str, message: BusMessage) -> None: ...


class MessageConsumer(Protocol):
    def consume(self, source: str, handler: Callable[[BusMessage], None]) -> None: ...
