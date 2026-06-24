"""Application wiring: connects Config → ObjectStore → Bus → JobHandler.

The factory-injection pattern (store_factory, bus_factory) keeps this module
unit-testable with InMemoryBus and FakeObjectStore, while run() provides the
production wiring with real MinIO and RabbitMQ.
"""
from __future__ import annotations

from typing import Callable

from .config import Config
from .handler import JobHandler
from .messaging.rabbitmq import RabbitMqBus
from .storage import MinioObjectStore, ObjectStore

PROCESS_JOB_SOURCE = "photo.process"
PROCESS_RESULT_DEST = "photo.result"


def build(
    config: Config,
    store_factory: Callable[[Config], ObjectStore],
    bus_factory: Callable[[Config], RabbitMqBus],
) -> RabbitMqBus:
    """Wire together the object store, bus, and job handler.

    Does NOT start the consume loop — call bus.start() (or bus.drain() for
    the in-memory fake) after building.  This separation makes the function
    fully testable without a live broker.

    Returns the bus so callers can drive it (start / drain / close).
    """
    store = store_factory(config)
    bus = bus_factory(config)
    handler = JobHandler(store, bus, result_dest=PROCESS_RESULT_DEST)
    bus.consume(PROCESS_JOB_SOURCE, handler.handle)
    return bus


def run(config: Config) -> None:
    """Production entry point: build with real adapters and block on the consume loop."""
    bus = build(
        config,
        store_factory=lambda c: MinioObjectStore(c),
        bus_factory=lambda c: RabbitMqBus(c.rabbitmq_url),
    )
    bus.start()
