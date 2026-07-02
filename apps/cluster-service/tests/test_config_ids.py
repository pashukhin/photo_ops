from __future__ import annotations

import uuid

import pytest

from cluster_service.config import load
from cluster_service.ids import uuid7

_ENV_VARS = [
    "RABBITMQ_URL",
    "CLUSTER_DATABASE_URL",
    "PHOTO_SERVICE_GRPC_URL",
    "CLUSTER_SERVICE_GRPC_PORT",
    "USAGE_PROVIDER",
]


def test_config_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    for v in _ENV_VARS:
        monkeypatch.delenv(v, raising=False)
    c = load()
    assert c.grpc_port == 50057
    assert c.provider == "local-demo"
    assert c.photo_service_grpc_url == "photo-service:50051"


def test_config_env_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLUSTER_SERVICE_GRPC_PORT", "6000")
    monkeypatch.setenv("USAGE_PROVIDER", "aws-eu")
    c = load()
    assert c.grpc_port == 6000
    assert c.provider == "aws-eu"


def test_uuid7_version_and_unique() -> None:
    a, b = uuid7(), uuid7()
    assert uuid.UUID(a).version == 7
    assert a != b
