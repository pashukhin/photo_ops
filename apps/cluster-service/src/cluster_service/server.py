"""cluster-service (API role): gRPC servicer + the cluster.result consumer.

The servicer accepts a run (creates a PENDING row, publishes cluster.process) and
serves reads (results, methods). The ResultConsumer flips a run to READY/FAILED
when the worker's cluster.result arrives (mirrors photo-service finalizing).
"""
from __future__ import annotations

import json
import logging
from collections.abc import Callable

import grpc
from cluster.v1 import cluster_service_pb2 as pb
from cluster.v1 import cluster_service_pb2_grpc as pb_grpc
from cluster.v1 import process_pb2
from common.v1 import common_pb2

from . import methods
from .codec import decode_result, encode_job
from .config import PROCESS_SOURCE
from .errors import UnknownMethodError
from .ids import uuid7
from .mapper import descriptor_to_proto, result_to_proto, summary_to_proto
from .messaging.port import BusMessage, MessagePublisher
from .store import Store

log = logging.getLogger(__name__)


class ClusterServicer(pb_grpc.ClusterServiceServicer):
    def __init__(
        self,
        *,
        store: Store,
        publisher: MessagePublisher,
        process_dest: str = PROCESS_SOURCE,
        id_factory: Callable[[], str] = uuid7,
    ) -> None:
        self._store = store
        self._publisher = publisher
        self._process_dest = process_dest
        self._id_factory = id_factory

    def Health(self, request, context):  # type: ignore[no-untyped-def]
        return common_pb2.HealthCheckResponse(status="ok", service="cluster-service")

    def ListClusteringMethods(self, request, context):  # type: ignore[no-untyped-def]
        return pb.ListClusteringMethodsResponse(
            methods=[descriptor_to_proto(m.descriptor) for m in methods.all_methods()]
        )

    def GenerateClusters(self, request, context):  # type: ignore[no-untyped-def]
        try:
            methods.get(request.method)
        except UnknownMethodError:
            context.abort(
                grpc.StatusCode.INVALID_ARGUMENT, f"unknown clustering method: {request.method!r}"
            )
        params_json = request.params_json or "{}"
        try:
            json.loads(params_json)  # reject bad params synchronously, not as an async FAILED
        except json.JSONDecodeError:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, "params must be valid JSON")
        result_id = self._id_factory()
        correlation_id = self._id_factory()  # thread trace context through the async flow
        scope = request.scope or "all"
        self._store.create_pending(
            result_id=result_id,
            user_id=request.user_id,
            method=request.method,
            params_json=params_json,
            scope=scope,
        )
        self._publisher.publish(
            self._process_dest,
            BusMessage(
                body=encode_job(
                    result_id=result_id,
                    user_id=request.user_id,
                    method=request.method,
                    params_json=params_json,
                    correlation_id=correlation_id,
                ),
                correlation_id=correlation_id,
            ),
        )
        return pb.GenerateClustersResponse(
            result_id=result_id, status=pb.CLUSTERING_STATUS_PENDING
        )

    def GetClusteringResult(self, request, context):  # type: ignore[no-untyped-def]
        r = self._store.get(result_id=request.result_id, user_id=request.user_id)
        if r is None:
            context.abort(grpc.StatusCode.NOT_FOUND, "clustering result not found")
            raise AssertionError("unreachable")  # pragma: no cover
        return result_to_proto(r)

    def ListClusteringResults(self, request, context):  # type: ignore[no-untyped-def]
        summaries = self._store.list_for_user(user_id=request.user_id)
        return pb.ListClusteringResultsResponse(
            results=[summary_to_proto(s) for s in summaries]
        )

    def DeleteClusteringResult(self, request, context):  # type: ignore[no-untyped-def]
        raise NotImplementedError  # GREEN: soft_delete -> NOT_FOUND on False


class ResultConsumer:
    """Consume cluster.result → flip the persisted run to READY / FAILED."""

    def __init__(self, store: Store) -> None:
        self._store = store

    def handle(self, message: BusMessage) -> None:
        res = decode_result(message.body)
        if res.outcome == process_pb2.CLUSTER_OUTCOME_SUCCEEDED:
            self._store.mark_ready(result_id=res.result_id)
        else:
            self._store.mark_failed(result_id=res.result_id, error_message=res.error_message)
