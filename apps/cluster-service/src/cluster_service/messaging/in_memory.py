from __future__ import annotations

from collections import deque
from typing import Callable

from .port import BusMessage, MessageConsumer, MessagePublisher

MAX_ATTEMPTS = 3

__all__ = ["InMemoryBus", "BusMessage"]


class InMemoryBus(MessagePublisher, MessageConsumer):
    """In-memory message bus for tests. Implements both publisher and consumer ports."""

    def __init__(self) -> None:
        self._handlers: dict[str, Callable[[BusMessage], None]] = {}
        self._queue: deque[tuple[str, BusMessage]] = deque()

    def publish(self, destination: str, message: BusMessage) -> None:
        self._queue.append((destination, message))

    def consume(self, source: str, handler: Callable[[BusMessage], None]) -> None:
        self._handlers[source] = handler

    def messages(self, destination: str) -> list[BusMessage]:
        """All messages published to `destination` (test inspection helper)."""
        return [m for d, m in self._queue if d == destination]

    def drain(self) -> None:
        """Deliver all queued messages, retrying up to MAX_ATTEMPTS on failure."""
        while self._queue:
            destination, message = self._queue.popleft()
            handler = self._handlers.get(destination)
            if handler is None:
                continue
            for _attempt in range(1, MAX_ATTEMPTS + 1):
                try:
                    handler(message)
                    break
                except Exception:
                    pass
