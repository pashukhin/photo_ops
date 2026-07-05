from __future__ import annotations

import pika.exceptions  # type: ignore[import-untyped]

from cluster_service.messaging.port import BusMessage
from cluster_service.messaging.rabbitmq import RabbitMqBus


class FakeChannel:
    def __init__(self) -> None:
        self.published: list[bytes] = []
        self.declared: list[str] = []
        self.fail_next_publish = False

    def exchange_declare(self, **kw: object) -> None:
        self.declared.append(str(kw.get("exchange", "")))

    def queue_declare(self, **kw: object) -> None:
        pass

    def queue_bind(self, **kw: object) -> None:
        pass

    def basic_qos(self, **kw: object) -> None:
        pass

    def basic_publish(self, **kw: object) -> None:
        if self.fail_next_publish:
            self.fail_next_publish = False
            raise pika.exceptions.StreamLostError("Stream connection lost")
        self.published.append(kw["body"])  # type: ignore[arg-type]


class FakeConnection:
    def __init__(self, channel: FakeChannel) -> None:
        self._channel = channel
        self.is_open = True

    def channel(self) -> FakeChannel:
        return self._channel

    def close(self) -> None:
        self.is_open = False


def test_publish_reconnects_after_idle_drop() -> None:
    # why: an idle broker drops the connection; the next publish must reconnect,
    # re-declare topology, and deliver — not raise a 500 to the gateway (the s014 bug)
    first, second = FakeChannel(), FakeChannel()
    first.fail_next_publish = True
    conns = iter([FakeConnection(first), FakeConnection(second)])
    bus = RabbitMqBus(connection_factory=lambda: next(conns))
    bus.publish("cluster.process", BusMessage(body=b"job", correlation_id="c"))
    assert second.published == [b"job"]  # delivered on the reconnected channel
    assert "cluster.process" in second.declared  # topology re-declared after reconnect


def test_publish_succeeds_without_drop() -> None:
    # why: the happy path is unchanged — one publish, one declare, no reconnect
    ch = FakeChannel()
    bus = RabbitMqBus(connection_factory=lambda: FakeConnection(ch))
    bus.publish("cluster.process", BusMessage(body=b"job", correlation_id="c"))
    assert ch.published == [b"job"]
