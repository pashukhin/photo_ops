from __future__ import annotations

from cluster_service.metering import (
    RawUsage,
    RssMemorySampler,
    _default_rss_reader,
    build_consumption_event,
    integrate_byte_seconds,
)


def test_integrate_byte_seconds_trapezoidal() -> None:
    assert integrate_byte_seconds([]) == 0.0
    assert integrate_byte_seconds([(0.0, 100)]) == 0.0
    # (100+200)/2*1 + (200+300)/2*2 = 150 + 500 = 650
    assert integrate_byte_seconds([(0.0, 100), (1.0, 200), (3.0, 300)]) == 650.0


def test_sampler_records_and_integrates() -> None:
    times = iter([0.0, 1.0, 2.0])
    reads = iter([100, 200, 300])
    sampler = RssMemorySampler(reader=lambda: next(reads), clock=lambda: next(times))
    sampler.sample()
    sampler.sample()
    sampler.sample()
    # (100+200)/2 + (200+300)/2 = 150 + 250
    assert sampler.byte_seconds() == 400.0


def test_default_rss_reader_positive() -> None:
    assert _default_rss_reader() > 0


def test_build_consumption_event_raw_units() -> None:
    ev = build_consumption_event(
        result_id="r1",
        user_id="u1",
        provider="local-demo",
        occurred_at="2024-06-15T12:00:00Z",
        usage=RawUsage(wall_seconds=2.4, cpu_seconds=1.6, byte_seconds=650.0, clusters_generated=1),
        correlation_id="trace-1",
    )
    assert ev.idempotency_key == "r1"  # charge-once == result_id
    assert ev.user_id == "u1"
    assert ev.provider == "local-demo"
    units = {m.unit: m.quantity for m in ev.measurements}
    assert units == {"operation": 1, "wall_second": 2, "cpu_second": 2, "byte_second": 650}
    assert all(m.source_entity_type == "cluster_result" for m in ev.measurements)
    assert all(m.source_entity_id == "r1" for m in ev.measurements)
