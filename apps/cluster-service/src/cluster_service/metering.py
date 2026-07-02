"""Self-metering: a compute run measures its own consumption in RAW
provider-independent units and emits a ConsumptionEvent (ADR-0004 contract).

Raw units only — never money. `idempotency_key == result_id` so a broker
redelivery is deduped charge-once by usage-service. byte_seconds is the
memory-time integral (∫ RSS dt), approximated by sampling RSS over the run.
"""
from __future__ import annotations

import os
import threading
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from usage.v1 import consumption_pb2

_SOURCE_ENTITY_TYPE = "cluster_result"


@dataclass(frozen=True)
class RawUsage:
    """Raw self-measured consumption of one clustering run."""

    wall_seconds: float
    cpu_seconds: float
    byte_seconds: float
    clusters_generated: int


def integrate_byte_seconds(samples: Sequence[tuple[float, int]]) -> float:
    """Trapezoidal integral of RSS (bytes) over time (seconds). Fewer than two
    samples integrate to 0.0."""
    total = 0.0
    for (t0, b0), (t1, b1) in zip(samples, samples[1:]):
        total += (b0 + b1) / 2.0 * (t1 - t0)
    return total


def _default_rss_reader() -> int:
    """Current process resident set size in bytes."""
    import psutil

    return int(psutil.Process(os.getpid()).memory_info().rss)


class RssMemorySampler:
    """Accumulates (time, RSS) samples to approximate byte_seconds. The sampling
    schedule is external: call sample() on a cadence (see run_periodic for the
    threaded driver), then read byte_seconds()."""

    def __init__(
        self,
        reader: Callable[[], int] = _default_rss_reader,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._reader = reader
        self._clock = clock
        self._samples: list[tuple[float, int]] = []

    def sample(self) -> None:
        self._samples.append((self._clock(), self._reader()))

    def byte_seconds(self) -> float:
        return integrate_byte_seconds(self._samples)


def run_periodic(
    sampler: RssMemorySampler, interval: float, stop: threading.Event
) -> None:  # pragma: no cover - threaded IO driver, exercised at component/smoke level
    """Sample until `stop` is set. Runs on a daemon thread around the compute."""
    while not stop.is_set():
        sampler.sample()
        stop.wait(interval)


def build_consumption_event(
    *,
    result_id: str,
    user_id: str,
    provider: str,
    occurred_at: str,
    usage: RawUsage,
    correlation_id: str = "",
) -> consumption_pb2.ConsumptionEvent:
    """Map a completed run's raw self-metering to a ConsumptionEvent
    (idempotency_key == result_id). One Measurement per raw unit."""

    def m(
        event_type: str, resource_type: str, quantity: int, unit: str
    ) -> consumption_pb2.Measurement:
        return consumption_pb2.Measurement(
            event_type=event_type,
            resource_type=resource_type,
            quantity=quantity,
            unit=unit,
            source_entity_type=_SOURCE_ENTITY_TYPE,
            source_entity_id=result_id,
        )

    return consumption_pb2.ConsumptionEvent(
        idempotency_key=result_id,
        user_id=user_id,
        provider=provider,
        occurred_at=occurred_at,
        correlation_id=correlation_id,
        measurements=[
            m("cluster_generated", "processing", usage.clusters_generated, "operation"),
            m("cluster_generated", "processing", round(usage.wall_seconds), "wall_second"),
            m("cluster_generated", "processing", round(usage.cpu_seconds), "cpu_second"),
            m("cluster_generated", "processing", round(usage.byte_seconds), "byte_second"),
        ],
    )
