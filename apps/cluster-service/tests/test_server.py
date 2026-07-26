from __future__ import annotations

import grpc
import pytest
from cluster.v1 import cluster_service_pb2 as pb
from cluster.v1 import process_pb2

from cluster_service.codec import decode_job, encode_result
from cluster_service.messaging.in_memory import BusMessage, InMemoryBus
from cluster_service.server import ClusterServicer, ResultConsumer
from cluster_service.store import InMemoryStore


class _Abort(Exception):
    pass


class FakeContext:
    def __init__(self) -> None:
        self.code = None
        self.details = None

    def abort(self, code, details):  # type: ignore[no-untyped-def]
        self.code = code
        self.details = details
        raise _Abort(details)


def _servicer(store: InMemoryStore | None = None, bus: InMemoryBus | None = None):
    store = store or InMemoryStore()
    bus = bus or InMemoryBus()
    svc = ClusterServicer(store=store, publisher=bus, id_factory=lambda: "rid1")
    return svc, store, bus


def test_generate_creates_pending_and_publishes_job() -> None:
    svc, store, bus = _servicer()
    resp = svc.GenerateClusters(
        pb.GenerateClustersRequest(user_id="u1", scope="all", method="time_only"), FakeContext()
    )
    assert resp.result_id == "rid1"
    assert resp.status == pb.CLUSTERING_STATUS_PENDING
    assert store.get(result_id="rid1", user_id="u1").status == "pending"
    jobs = bus.messages("cluster.process")
    assert len(jobs) == 1
    job = decode_job(jobs[0].body)
    assert job.result_id == "rid1"
    assert job.method == "time_only"


def test_generate_unknown_method_aborts() -> None:
    svc, _, _ = _servicer()
    ctx = FakeContext()
    with pytest.raises(_Abort):
        svc.GenerateClusters(pb.GenerateClustersRequest(user_id="u1", method="space_time"), ctx)
    assert ctx.code == grpc.StatusCode.INVALID_ARGUMENT


def test_generate_invalid_params_json_aborts() -> None:
    svc, _, _ = _servicer()
    ctx = FakeContext()
    with pytest.raises(_Abort):
        svc.GenerateClusters(
            pb.GenerateClustersRequest(user_id="u1", method="time_only", params_json="{bad"), ctx
        )
    assert ctx.code == grpc.StatusCode.INVALID_ARGUMENT


def test_delete_clustering_result_not_found_aborts() -> None:
    # why: parity with GetClusteringResult — a 0-row delete is NOT_FOUND, never a blanket OK
    svc, _, _ = _servicer()
    ctx = FakeContext()
    with pytest.raises(_Abort):
        svc.DeleteClusteringResult(
            pb.DeleteClusteringResultRequest(result_id="missing", user_id="u1"), ctx
        )
    assert ctx.code == grpc.StatusCode.NOT_FOUND


def test_delete_clustering_result_soft_deletes_owned_run() -> None:
    # why: an owned run is removed from the caller's list after delete
    svc, store, _ = _servicer()
    store.create_pending(
        result_id="r1", user_id="u1", method="time_only", params_json="{}", scope="all"
    )
    svc.DeleteClusteringResult(
        pb.DeleteClusteringResultRequest(result_id="r1", user_id="u1"), FakeContext()
    )
    assert store.list_for_user(user_id="u1") == []


def test_get_result_is_owner_scoped() -> None:
    svc, _, _ = _servicer()
    req = pb.GenerateClustersRequest(user_id="u1", method="time_only")
    svc.GenerateClusters(req, FakeContext())
    got = svc.GetClusteringResult(
        pb.GetClusteringResultRequest(result_id="rid1", user_id="u1"), FakeContext()
    )
    assert got.id == "rid1"
    assert got.status == pb.CLUSTERING_STATUS_PENDING

    ctx = FakeContext()
    with pytest.raises(_Abort):
        svc.GetClusteringResult(
            pb.GetClusteringResultRequest(result_id="rid1", user_id="other"), ctx
        )
    assert ctx.code == grpc.StatusCode.NOT_FOUND


def test_health() -> None:
    svc, _, _ = _servicer()
    resp = svc.Health(None, FakeContext())
    assert resp.status == "ok"
    assert resp.service == "cluster-service"


def test_list_methods_lists_time_only() -> None:
    svc, _, _ = _servicer()
    resp = svc.ListClusteringMethods(pb.ListClusteringMethodsRequest(), FakeContext())
    assert [m.id for m in resp.methods] == ["time_only"]


def test_list_results() -> None:
    svc, _, _ = _servicer()
    req = pb.GenerateClustersRequest(user_id="u1", method="time_only")
    svc.GenerateClusters(req, FakeContext())
    resp = svc.ListClusteringResults(pb.ListClusteringResultsRequest(user_id="u1"), FakeContext())
    assert [r.id for r in resp.results] == ["rid1"]


def test_result_consumer_flips_status() -> None:
    store = InMemoryStore()
    for rid in ("r1", "r2"):
        store.create_pending(
            result_id=rid, user_id="u1", method="time_only", params_json="{}", scope="all"
        )
    rc = ResultConsumer(store)
    rc.handle(
        BusMessage(
            body=encode_result(
                result_id="r1",
                user_id="u1",
                correlation_id="",
                outcome=process_pb2.CLUSTER_OUTCOME_SUCCEEDED,
            ),
            correlation_id="",
        )
    )
    rc.handle(
        BusMessage(
            body=encode_result(
                result_id="r2",
                user_id="u1",
                correlation_id="",
                outcome=process_pb2.CLUSTER_OUTCOME_FAILED,
                error_message="boom",
            ),
            correlation_id="",
        )
    )
    assert store.get(result_id="r1", user_id="u1").status == "ready"
    r2 = store.get(result_id="r2", user_id="u1")
    assert r2.status == "failed"
    assert r2.error_message == "boom"
