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
JobHandler catches expected/permanent failures (missing object, bad image, decode
error) and publishes a FAILED result — it does not raise for those. Two kinds of
exception DO escape it, handled differently in _on_message:

  • A TransientProcessingError (photo_ops-0od) signals a retryable storage hiccup
    (MinIO unreachable / 5xx / reset). We republish the job with an incremented
    x-attempt header and ack the original — a bounded, immediate retry with NO
    callback sleep (a sleep would block the single BlockingConnection, prefetch=1 →
    head-of-line stall). The bound lives in JobHandler, which gives up (publishes
    FAILED) once x-attempt reaches the cap, so this never loops forever. The
    republish uses the existing photo.process exchange — no topology change.
  • Any other escaping exception is an *unexpected* crash (OOM, a handler bug); we
    basic_nack(requeue=False) straight to the DLQ, since retrying is likely to
    repeat it.

Crash-before-ack redelivery (broker-side) is made idempotent by the MinIO-metadata
claim check inside JobHandler.
"""
from __future__ import annotations

import logging
import time
from typing import Callable

import pika  # type: ignore[import-untyped]
import pika.exceptions  # type: ignore[import-untyped]
import pika.spec  # type: ignore[import-untyped]

from .port import BusMessage
from .retry import requeue_on, retry_attempt

log = logging.getLogger(__name__)


class RabbitMqBus:
    """Blocking RabbitMQ adapter.

    Implements both MessagePublisher and MessageConsumer (duck-typed; no
    explicit Protocol import to keep the runtime dependency minimal).
    """

    def __init__(self, url: str, *, connect_attempts: int = 15, connect_delay: float = 2.0) -> None:
        self._connection = self._connect(url, connect_attempts, connect_delay)
        self._channel = self._connection.channel()
        self._declared: set[str] = set()

    @staticmethod
    def _connect(url: str, attempts: int, delay: float) -> pika.BlockingConnection:
        """Open the broker connection, retrying transient failures.

        At stack startup RabbitMQ may report healthy a moment before its AMQP
        listener accepts connections; a single attempt would crash the worker.
        Retry a bounded number of times before giving up.
        """
        params = pika.URLParameters(url)
        for attempt in range(1, attempts + 1):
            try:
                return pika.BlockingConnection(params)
            except pika.exceptions.AMQPConnectionError:
                if attempt == attempts:
                    raise
                log.warning(
                    "rabbitmq connect failed (attempt %d/%d); retrying in %.1fs",
                    attempt,
                    attempts,
                    delay,
                )
                time.sleep(delay)
        raise AssertionError("unreachable")  # pragma: no cover

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

        def _on_message(ch, method, props, body):  # type: ignore[no-untyped-def]  # pragma: no cover - live-broker IO (smoke-verified); retry LOGIC is unit-covered in retry.py
            correlation_id: str = (
                props.correlation_id if props.correlation_id else ""
            )
            headers = props.headers or {}
            bus_message = BusMessage(body=body, correlation_id=correlation_id, headers=headers)
            try:
                handler(bus_message)
                ch.basic_ack(delivery_tag=method.delivery_tag)
            except Exception as exc:
                if requeue_on(exc):
                    # Bounded transient retry: republish the job with an incremented
                    # x-attempt counter and ack the original. No time.sleep here — it
                    # would block the single BlockingConnection (prefetch=1 → head-of-line
                    # stall). The bound lives in the handler, which gives up (publishes
                    # FAILED) once x-attempt reaches the cap, so this never loops forever.
                    new_headers = dict(headers)
                    new_headers["x-attempt"] = retry_attempt(headers) + 1
                    ch.basic_publish(
                        exchange=source,
                        routing_key=source,
                        body=body,
                        properties=pika.BasicProperties(
                            delivery_mode=2,
                            correlation_id=props.correlation_id,
                            headers=new_headers,
                        ),
                    )
                    ch.basic_ack(delivery_tag=method.delivery_tag)
                    return
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
