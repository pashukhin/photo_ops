"""cluster-worker role: consume cluster.process → compute → persist tree →
publish cluster.result + emit a ConsumptionEvent.

Mirrors media-worker's handler: any single run's failure is caught and published
as a FAILED result (the consumer never crashes on one bad job). The tree is
persisted here; the server's result-consumer flips the run's status.
"""
from __future__ import annotations

import json
import logging
import time
from collections.abc import Callable
from datetime import datetime, timezone

from cluster.v1 import process_pb2

from .codec import decode_job, encode_result
from .config import RESULT_SOURCE, USAGE_EVENTS_DEST
from .ids import uuid7
from .messaging.port import BusMessage, MessagePublisher
from .metering import RawUsage, RssMemorySampler, build_consumption_event
from .pipeline import run_clustering
from .ports import PhotoSpacetimeReader
from .store import Store

log = logging.getLogger(__name__)


def _utc_now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _usage_json(u: RawUsage) -> str:
    return json.dumps(
        {
            "wall_seconds": u.wall_seconds,
            "cpu_seconds": u.cpu_seconds,
            "byte_seconds": u.byte_seconds,
            "clusters_generated": u.clusters_generated,
        }
    )


class ClusterWorker:
    def __init__(
        self,
        *,
        store: Store,
        photo_reader: PhotoSpacetimeReader,
        publisher: MessagePublisher,
        provider: str,
        result_dest: str = RESULT_SOURCE,
        usage_dest: str = USAGE_EVENTS_DEST,
        id_factory: Callable[[], str] = uuid7,
        clock: Callable[[], float] = time.monotonic,
        cpu_clock: Callable[[], float] = time.process_time,
        now: Callable[[], str] = _utc_now_iso,
        sampler_factory: Callable[[], RssMemorySampler] = RssMemorySampler,
    ) -> None:
        self._store = store
        self._photo_reader = photo_reader
        self._publisher = publisher
        self._provider = provider
        self._result_dest = result_dest
        self._usage_dest = usage_dest
        self._id_factory = id_factory
        self._clock = clock
        self._cpu_clock = cpu_clock
        self._now = now
        self._sampler_factory = sampler_factory

    def handle(self, message: BusMessage) -> None:
        job = decode_job(message.body)
        try:
            self._process(job)
        except Exception as exc:  # one run's failure must not crash the consumer
            log.exception("cluster.process failed result_id=%s", job.result_id)
            self._publisher.publish(
                self._result_dest,
                BusMessage(
                    body=encode_result(
                        result_id=job.result_id,
                        user_id=job.user_id,
                        correlation_id=job.correlation_id,
                        outcome=process_pb2.CLUSTER_OUTCOME_FAILED,
                        error_message=str(exc),
                    ),
                    correlation_id=job.correlation_id,
                ),
            )

    def _process(self, job: process_pb2.ClusterProcessJob) -> None:
        params = json.loads(job.params_json) if job.params_json else {}
        sampler = self._sampler_factory()
        sampler.sample()
        t0, c0 = self._clock(), self._cpu_clock()

        points = list(self._photo_reader.list_spacetime(job.user_id))
        tree = run_clustering(points, job.method, params, self._id_factory)

        sampler.sample()
        usage = RawUsage(
            wall_seconds=self._clock() - t0,
            cpu_seconds=self._cpu_clock() - c0,
            byte_seconds=sampler.byte_seconds(),
            # One billable clustering operation (mirrors photo_processed=1). The
            # tree's node/photo counts are on the result, not the usage ledger.
            clusters_generated=1,
        )
        applied = self._store.save_tree(
            result_id=job.result_id, tree=tree, consumption_json=_usage_json(usage)
        )
        if not applied:
            # No live pending result to fill (missing / already failed) — skip the
            # SUCCEEDED publish and the usage emission (1m8: don't phantom-succeed a run
            # with no tree, don't charge for it).
            log.info("cluster.process skipped: save_tree not applied result_id=%s", job.result_id)
            return

        event = build_consumption_event(
            result_id=job.result_id,
            user_id=job.user_id,
            provider=self._provider,
            occurred_at=self._now(),
            usage=usage,
            correlation_id=job.correlation_id,
        )
        self._publisher.publish(
            self._usage_dest,
            BusMessage(body=event.SerializeToString(), correlation_id=job.correlation_id),
        )
        self._publisher.publish(
            self._result_dest,
            BusMessage(
                body=encode_result(
                    result_id=job.result_id,
                    user_id=job.user_id,
                    correlation_id=job.correlation_id,
                    outcome=process_pb2.CLUSTER_OUTCOME_SUCCEEDED,
                ),
                correlation_id=job.correlation_id,
            ),
        )
