from __future__ import annotations

from collections.abc import Sequence

from cluster.v1 import process_pb2
from conftest import make_point

from cluster_service.codec import decode_result, encode_job
from cluster_service.messaging.in_memory import BusMessage, InMemoryBus
from cluster_service.model import PhotoPoint
from cluster_service.store import InMemoryStore
from cluster_service.worker import ClusterWorker


class FakeReader:
    def __init__(self, points: Sequence[PhotoPoint]) -> None:
        self._points = points

    def list_spacetime(self, user_id: str) -> Sequence[PhotoPoint]:
        return self._points


class FailingReader:
    def list_spacetime(self, user_id: str) -> Sequence[PhotoPoint]:
        raise RuntimeError("photo-service unavailable")


def _pending(store: InMemoryStore) -> None:
    store.create_pending(
        result_id="r1", user_id="u1", method="time_only", params_json="{}", scope="all"
    )


def _job() -> BusMessage:
    return BusMessage(
        body=encode_job(result_id="r1", user_id="u1", method="time_only", params_json="{}"),
        correlation_id="c1",
    )


def test_worker_success_persists_and_publishes(id_factory) -> None:
    # RED until compute GREEN (photo_ops-9dk): pins the SUCCESS path.
    store = InMemoryStore()
    _pending(store)
    bus = InMemoryBus()
    worker = ClusterWorker(
        store=store,
        photo_reader=FakeReader([make_point("a", minutes=0), make_point("b", minutes=1)]),
        publisher=bus,
        provider="local-demo",
        id_factory=id_factory,
        now=lambda: "2024-06-15T12:00:00+00:00",
    )
    worker.handle(_job())

    assert store.get(result_id="r1", user_id="u1").root is not None
    results = bus.messages("cluster.result")
    assert len(results) == 1
    assert decode_result(results[0].body).outcome == process_pb2.CLUSTER_OUTCOME_SUCCEEDED
    assert len(bus.messages("usage.events")) == 1


def test_worker_failure_publishes_failed_and_no_consumption() -> None:
    store = InMemoryStore()
    _pending(store)
    bus = InMemoryBus()
    worker = ClusterWorker(
        store=store, photo_reader=FailingReader(), publisher=bus, provider="local-demo"
    )
    worker.handle(_job())

    results = bus.messages("cluster.result")
    assert len(results) == 1
    assert decode_result(results[0].body).outcome == process_pb2.CLUSTER_OUTCOME_FAILED
    assert bus.messages("usage.events") == []  # no consumption on failure
    # the worker does not flip status — the server's result-consumer does
    assert store.get(result_id="r1", user_id="u1").status == "pending"
