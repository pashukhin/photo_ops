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


class RabbitMqBus:  # pragma: no cover - live-broker IO adapter (smoke-verified)
    """Blocking RabbitMQ adapter implementing both messaging ports."""

    def __init__(self, url: str, *, connect_attempts: int = 15, connect_delay: float = 2.0) -> None:
        self._connection = self._connect(url, connect_attempts, connect_delay)
        self._channel = self._connection.channel()
        self._declared: set[str] = set()

    @staticmethod
    def _connect(url: str, attempts: int, delay: float) -> "pika.BlockingConnection":
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
        self._ensure_topology(destination)
        self._channel.basic_publish(
            exchange=destination,
            routing_key=destination,
            body=message.body,
            properties=pika.BasicProperties(delivery_mode=2, correlation_id=message.correlation_id),
        )

    def consume(self, source: str, handler: Callable[[BusMessage], None]) -> None:
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

    def start(self) -> None:
        self._channel.start_consuming()

    def close(self) -> None:
        try:
            if self._connection.is_open:
                self._connection.close()
        except Exception:
            log.debug("ignored error closing RabbitMQ connection", exc_info=True)
