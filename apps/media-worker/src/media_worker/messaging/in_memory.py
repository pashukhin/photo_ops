from __future__ import annotations

from collections import deque
from typing import Callable

from src.media_worker.messaging.port import BusMessage, MessageConsumer, MessagePublisher

MAX_ATTEMPTS = 3

# Re-export BusMessage so callers can import it directly from this module.
__all__ = ["InMemoryBus", "BusMessage"]


class InMemoryBus(MessagePublisher, MessageConsumer):
    """In-memory message bus for testing.  Implements both publisher and consumer ports."""

    def __init__(self) -> None:
        # consume() overwrites any existing handler for a name (single-consumer fake)
        self._handlers: dict[str, Callable[[BusMessage], None]] = {}
        self._queue: deque[tuple[str, BusMessage]] = deque()

    def publish(self, destination: str, message: BusMessage) -> None:
        self._queue.append((destination, message))

    def consume(self, source: str, handler: Callable[[BusMessage], None]) -> None:
        self._handlers[source] = handler

    def drain(self) -> None:
        """Deliver all queued messages, retrying up to MAX_ATTEMPTS times on failure."""
        while self._queue:
            destination, message = self._queue.popleft()
            handler = self._handlers.get(destination)
            if handler is None:
                continue
            for attempt in range(1, MAX_ATTEMPTS + 1):
                try:
                    handler(message)
                    break  # success → ack, stop retrying
                except Exception:
                    if attempt == MAX_ATTEMPTS:
                        pass  # drop after MAX_ATTEMPTS total attempts
