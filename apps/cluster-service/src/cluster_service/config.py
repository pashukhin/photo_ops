"""Runtime config + AMQP logical names, loaded from the environment."""
from __future__ import annotations

import os
from dataclasses import dataclass

# AMQP logical names (topology declared by the consumer of each; mirrors photo/usage).
PROCESS_SOURCE = "cluster.process"  # server publishes, worker consumes
RESULT_SOURCE = "cluster.result"  # worker publishes, server consumes
USAGE_EVENTS_DEST = "usage.events"  # worker publishes, usage-service consumes


@dataclass(frozen=True)
class Config:
    rabbitmq_url: str
    cluster_database_url: str
    photo_service_grpc_url: str
    grpc_port: int
    provider: str  # physical provenance stamp for consumption events (ADR-0004)


def load() -> Config:
    return Config(
        rabbitmq_url=os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672"),
        cluster_database_url=os.getenv(
            "CLUSTER_DATABASE_URL", "postgres://cluster_user:cluster_pass@postgres:5432/cluster_db"
        ),
        photo_service_grpc_url=os.getenv("PHOTO_SERVICE_GRPC_URL", "photo-service:50051"),
        grpc_port=int(os.getenv("CLUSTER_SERVICE_GRPC_PORT", "50057")),
        provider=os.getenv("USAGE_PROVIDER", "local-demo"),
    )
