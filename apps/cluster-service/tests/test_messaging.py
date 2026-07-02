from __future__ import annotations

from cluster_service.messaging.in_memory import BusMessage, InMemoryBus


def test_publish_consume_drain() -> None:
    bus = InMemoryBus()
    got: list[bytes] = []
    bus.consume("x", lambda m: got.append(m.body))
    bus.publish("x", BusMessage(body=b"hi", correlation_id="c"))
    assert [m.body for m in bus.messages("x")] == [b"hi"]
    bus.drain()
    assert got == [b"hi"]


def test_drain_without_handler_drops() -> None:
    bus = InMemoryBus()
    bus.publish("y", BusMessage(body=b"z", correlation_id=""))
    bus.drain()  # no registered handler → dropped, no error


def test_drain_retries_then_drops() -> None:
    bus = InMemoryBus()
    calls: list[int] = []

    def boom(_m: BusMessage) -> None:
        calls.append(1)
        raise ValueError("nope")

    bus.consume("x", boom)
    bus.publish("x", BusMessage(body=b"a", correlation_id=""))
    bus.drain()
    assert len(calls) == 3  # MAX_ATTEMPTS
