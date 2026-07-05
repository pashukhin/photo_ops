"""RabbitMQ transport adapter (MessagePublisher + MessageConsumer).

Mirrors apps/media-worker/src/media_worker/messaging/rabbitmq.py exactly — same
topology (direct exchange + DLX/DLQ per logical name), same nack-to-DLQ strategy.
Live-broker IO: excluded from unit coverage (pragma) and exercised by the
component/smoke tests (photo_ops-zpe).
"""
from __future__ import annotations

import logging
import time
from typing import Callable

import pika  # type: ignore[import-untyped]
import pika.exceptions  # type: ignore[import-untyped]

from .port import BusMessage

log = logging.getLogger(__name__)


class RabbitMqBus:
    """Blocking RabbitMQ adapter implementing both messaging ports.

    The connection is opened through an injectable ``connection_factory`` so the
    reconnect-on-publish logic (photo_ops-di8) is unit-testable with a fake
    channel; the real pika connect stays ``# pragma: no cover`` (smoke-verified).
    """

    def __init__(
        self,
        url: str | None = None,
        *,
        connect_attempts: int = 15,
        connect_delay: float = 2.0,
        connection_factory: "Callable[[], pika.BlockingConnection] | None" = None,
    ) -> None:
        if connection_factory is None:  # pragma: no cover - real connect path
            connection_factory = self._default_factory(url, connect_attempts, connect_delay)
        self._factory = connection_factory
        self._connection = self._factory()
        self._channel = self._connection.channel()
        self._declared: set[str] = set()

    def _default_factory(  # pragma: no cover - live-broker IO
        self, url: str | None, attempts: int, delay: float
    ) -> "Callable[[], pika.BlockingConnection]":
        assert url is not None, "url is required without a connection_factory"

        def factory() -> "pika.BlockingConnection":
            return self._connect(url, attempts, delay)

        return factory

    @staticmethod
    def _connect(  # pragma: no cover - live-broker IO
        url: str, attempts: int, delay: float
    ) -> "pika.BlockingConnection":
        params = pika.URLParameters(url)
        for attempt in range(1, attempts + 1):
            try:
                return pika.BlockingConnection(params)
            except pika.exceptions.AMQPConnectionError:
                if attempt == attempts:
                    raise
                log.warning(
                    "rabbitmq connect %d/%d failed; retry in %.1fs", attempt, attempts, delay
                )
                time.sleep(delay)
        raise AssertionError("unreachable")

    def _ensure_topology(self, name: str) -> None:
        if name in self._declared:
            return
        dlx_name = name + ".dlx"
        dlq_name = name + ".dlq"
        self._channel.exchange_declare(exchange=name, exchange_type="direct", durable=True)
        self._channel.exchange_declare(exchange=dlx_name, exchange_type="direct", durable=True)
        self._channel.queue_declare(queue=dlq_name, durable=True)
        self._channel.queue_bind(queue=dlq_name, exchange=dlx_name, routing_key=name)
        self._channel.queue_declare(
            queue=name, durable=True, arguments={"x-dead-letter-exchange": dlx_name}
        )
        self._channel.queue_bind(queue=name, exchange=name, routing_key=name)
        self._declared.add(name)

    def publish(self, destination: str, message: BusMessage) -> None:
        # The server role only publishes on demand and never services the
        # connection, so an idle broker heartbeat can drop it; the next publish
        # then raises. Reconnect once and retry so a dropped idle connection
        # recovers transparently instead of surfacing a 500 (photo_ops-di8).
        try:
            self._publish_once(destination, message)
        except pika.exceptions.AMQPConnectionError:
            log.warning("rabbitmq publish failed (connection lost); reconnecting and retrying")
            self._reconnect()
            self._publish_once(destination, message)

    def _publish_once(self, destination: str, message: BusMessage) -> None:
        self._ensure_topology(destination)
        self._channel.basic_publish(
            exchange=destination,
            routing_key=destination,
            body=message.body,
            properties=pika.BasicProperties(delivery_mode=2, correlation_id=message.correlation_id),
        )

    def _reconnect(self) -> None:
        try:
            self._connection.close()
        except Exception:  # pragma: no cover - best-effort close of an already-dead connection
            log.debug("ignored error closing dropped RabbitMQ connection", exc_info=True)
        self._connection = self._factory()
        self._channel = self._connection.channel()
        self._declared = set()  # topology must be re-declared on the fresh channel

    def consume(  # pragma: no cover - live-broker IO
        self, source: str, handler: Callable[[BusMessage], None]
    ) -> None:
        self._ensure_topology(source)
        self._channel.basic_qos(prefetch_count=1)

        def _on_message(ch, method, props, body):  # type: ignore[no-untyped-def]
            correlation_id = props.correlation_id if props.correlation_id else ""
            try:
                handler(BusMessage(body=body, correlation_id=correlation_id))
                ch.basic_ack(delivery_tag=method.delivery_tag)
            except Exception:
                log.exception("handler error correlation_id=%r; nack->DLQ", correlation_id)
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

        self._channel.basic_consume(queue=source, on_message_callback=_on_message)

    def start(self) -> None:  # pragma: no cover - live-broker IO
        self._channel.start_consuming()

    def close(self) -> None:  # pragma: no cover - live-broker IO
        try:
            if self._connection.is_open:
                self._connection.close()
        except Exception:
            log.debug("ignored error closing RabbitMQ connection", exc_info=True)
