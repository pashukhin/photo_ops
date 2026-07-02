"""Entrypoint for the cluster-worker role: consume cluster.process and compute.

Wires the real adapters and blocks on the consume loop. GREEN (photo_ops-ecc);
smoke-verified. Run: `python -m cluster_service.worker_main`.
"""
from __future__ import annotations

from .config import PROCESS_SOURCE, load
from .messaging.rabbitmq import RabbitMqBus
from .photo_client import PhotoServiceClient
from .store_postgres import PostgresStore
from .worker import ClusterWorker


def main() -> None:  # pragma: no cover - process entrypoint, smoke-verified
    cfg = load()
    store = PostgresStore(cfg.cluster_database_url)
    bus = RabbitMqBus(cfg.rabbitmq_url)
    photo_reader = PhotoServiceClient(cfg.photo_service_grpc_url)
    worker = ClusterWorker(
        store=store, photo_reader=photo_reader, publisher=bus, provider=cfg.provider
    )
    bus.consume(PROCESS_SOURCE, worker.handle)
    bus.start()


if __name__ == "__main__":
    main()
