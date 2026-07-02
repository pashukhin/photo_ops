"""Entrypoint for the cluster-service (API) role: gRPC server + cluster.result consumer.

Wires the real adapters and blocks. GREEN (photo_ops-ecc); smoke-verified.
Run: `python -m cluster_service.server_main` (PYTHONPATH=src:src/photoops_proto).
"""
from __future__ import annotations

import threading
from concurrent import futures

import grpc
from cluster.v1 import cluster_service_pb2_grpc as pb_grpc

from .config import RESULT_SOURCE, load
from .messaging.rabbitmq import RabbitMqBus
from .server import ClusterServicer, ResultConsumer
from .store_postgres import PostgresStore


def main() -> None:  # pragma: no cover - process entrypoint, smoke-verified
    cfg = load()
    store = PostgresStore(cfg.cluster_database_url)
    publish_bus = RabbitMqBus(cfg.rabbitmq_url)

    servicer = ClusterServicer(store=store, publisher=publish_bus)
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=8))
    pb_grpc.add_ClusterServiceServicer_to_server(servicer, server)
    server.add_insecure_port(f"[::]:{cfg.grpc_port}")
    server.start()

    # Result consumer on its own connection/thread (blocking consume loop).
    consume_bus = RabbitMqBus(cfg.rabbitmq_url)
    consume_bus.consume(RESULT_SOURCE, ResultConsumer(store).handle)
    threading.Thread(target=consume_bus.start, daemon=True).start()

    server.wait_for_termination()


if __name__ == "__main__":
    main()
