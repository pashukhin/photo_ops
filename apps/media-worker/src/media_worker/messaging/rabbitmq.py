"""RabbitMQ transport adapter implementing the MessagePublisher / MessageConsumer ports.

Broker topology (canonical — mirrored exactly by the TypeScript adapter in Task 4.2):
  For a logical name N:
    exchange N            — type "direct", durable
    queue N               — durable; x-dead-letter-exchange = N + ".dlx"
                            bound to exchange N with routing key N
    exchange N + ".dlx"   — type "direct", durable  (dead-letter exchange)
    queue N + ".dlq"      — durable
                            bound to exchange N + ".dlx" with routing key N

Error/ack strategy rationale
─────────────────────────────
On a pika callback exception we call basic_nack(requeue=False), sending the
message straight to the DLQ.  This is a deliberate simplification of the
"retry N → DLQ" pattern:

  • JobHandler already catches all *expected* failure modes (missing object,
    bad image, decode error) and publishes a FAILED result — it never raises.
  • An exception that escapes JobHandler is therefore an *unexpected* crash
    (e.g. an out-of-memory condition, a bug in the handler itself).
  • For unexpected crashes, retrying on the same consumer is likely to repeat
    the crash; dead-lettering immediately keeps the queue healthy.
  • Crash-before-ack redelivery (broker-side) is made idempotent by the
    MinIO-metadata claim check inside JobHandler.
"""
from __future__ import annotations

import logging
from typing import Callable

import pika  # type: ignore[import-untyped]
import pika.spec  # type: ignore[import-untyped]

from .port import BusMessage

log = logging.getLogger(__name__)


class RabbitMqBus:
    """Blocking RabbitMQ adapter.

    Implements both MessagePublisher and MessageConsumer (duck-typed; no
    explicit Protocol import to keep the runtime dependency minimal).
    """

    def __init__(self, url: str) -> None:
        self._connection = pika.BlockingConnection(pika.URLParameters(url))
        self._channel = self._connection.channel()
        self._declared: set[str] = set()

    # ------------------------------------------------------------------
    # Topology
    # ------------------------------------------------------------------

    def _ensure_topology(self, name: str) -> None:
        """Idempotently declare exchange, queue, DLX, and DLQ for *name*.

        Safe to call multiple times — the declared-names set ensures we
        only hit the broker once per logical name per connection lifetime.
        """
        if name in self._declared:
            return

        dlx_name = name + ".dlx"
        dlq_name = name + ".dlq"

        # Main exchange
        self._channel.exchange_declare(
            exchange=name,
            exchange_type="direct",
            durable=True,
        )

        # Dead-letter exchange + queue
        self._channel.exchange_declare(
            exchange=dlx_name,
            exchange_type="direct",
            durable=True,
        )
        self._channel.queue_declare(queue=dlq_name, durable=True)
        self._channel.queue_bind(
            queue=dlq_name,
            exchange=dlx_name,
            routing_key=name,
        )

        # Main queue — points rejected messages at the DLX
        self._channel.queue_declare(
            queue=name,
            durable=True,
            arguments={"x-dead-letter-exchange": dlx_name},
        )
        self._channel.queue_bind(
            queue=name,
            exchange=name,
            routing_key=name,
        )

        self._declared.add(name)

    # ------------------------------------------------------------------
    # Publisher port
    # ------------------------------------------------------------------

    def publish(self, destination: str, message: BusMessage) -> None:
        """Publish *message* to exchange *destination* (persistent delivery)."""
        self._ensure_topology(destination)
        self._channel.basic_publish(
            exchange=destination,
            routing_key=destination,
            body=message.body,
            properties=pika.BasicProperties(
                delivery_mode=2,  # persistent
                correlation_id=message.correlation_id,
            ),
        )

    # ------------------------------------------------------------------
    # Consumer port
    # ------------------------------------------------------------------

    def consume(self, source: str, handler: Callable[[BusMessage], None]) -> None:
        """Register *handler* for messages arriving on *source*.

        Prefetch is set to 1 so the worker processes one job at a time and
        back-pressure is applied to the broker naturally.
        """
        self._ensure_topology(source)
        self._channel.basic_qos(prefetch_count=1)

        def _on_message(ch, method, props, body):  # type: ignore[no-untyped-def]
            correlation_id: str = (
                props.correlation_id if props.correlation_id else ""
            )
            bus_message = BusMessage(body=body, correlation_id=correlation_id)
            try:
                handler(bus_message)
                ch.basic_ack(delivery_tag=method.delivery_tag)
            except Exception:
                log.exception(
                    "Unexpected error handling message correlation_id=%r; "
                    "nack-ing to DLQ (requeue=False).",
                    correlation_id,
                )
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

        self._channel.basic_consume(queue=source, on_message_callback=_on_message)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(self) -> None:
        """Block and process messages until the connection is closed."""
        self._channel.start_consuming()

    def close(self) -> None:
        """Best-effort graceful close — swallows errors on already-closed connections."""
        try:
            if self._connection.is_open:
                self._connection.close()
        except Exception:
            log.debug("Ignored error while closing RabbitMQ connection.", exc_info=True)
