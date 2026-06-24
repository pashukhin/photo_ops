"""TDD wiring test: app.build() with InMemoryBus + FakeObjectStore.

No real broker or MinIO is involved — RabbitMqBus is NOT instantiated here.
The real RabbitMqBus is covered by the Task 4.2 integration test.
"""
from __future__ import annotations

import io

from PIL import Image

from src.media_worker.app import PROCESS_JOB_SOURCE, PROCESS_RESULT_DEST, build
from src.media_worker.config import Config
from src.media_worker.messaging.in_memory import BusMessage, InMemoryBus
from src.photoops_proto.photo.v1 import processing_pb2  # type: ignore[import-untyped]
from tests.fakes import FakeObjectStore

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_jpeg(width: int = 640, height: int = 480) -> bytes:
    """Build a minimal in-memory JPEG for testing."""
    buf = io.BytesIO()
    img = Image.new("RGB", (width, height), color=(100, 150, 200))
    img.save(buf, format="JPEG")
    return buf.getvalue()


def _throwaway_config() -> Config:
    return Config(
        minio_endpoint="http://localhost:9000",
        minio_access_key="minioadmin",
        minio_secret_key="minioadmin",
        minio_bucket="test-bucket",
        rabbitmq_url="amqp://guest:guest@localhost:5672",
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestAppWiring:
    """Verify that build() wires job → handler → result through InMemoryBus."""

    def test_job_routes_to_result_on_photo_result_queue(self) -> None:
        """Publishing a valid ProcessPhotoJob drains to a SUCCEEDED result on photo.result."""
        fake_store = FakeObjectStore()
        bus = InMemoryBus()

        # Seed store with a valid JPEG at the object key the job refers to
        object_key = "originals/photo-wiring-1.jpg"
        fake_store._store[object_key] = (_make_jpeg(), "image/jpeg", {})  # noqa: SLF001

        # Register a collector for photo.result BEFORE building so drain() delivers there.
        results: list[tuple[str, BusMessage]] = []
        bus.consume(PROCESS_RESULT_DEST, lambda m: results.append((PROCESS_RESULT_DEST, m)))

        config = _throwaway_config()
        built_bus = build(
            config,
            store_factory=lambda c: fake_store,
            bus_factory=lambda c: bus,
        )

        # Publish a job to the process source
        job = processing_pb2.ProcessPhotoJob(
            job_id="wiring-job-1",
            photo_id="wiring-photo-1",
            user_id="user-wiring",
            object_key=object_key,
            correlation_id="wiring-corr-1",
        )
        bus.publish(PROCESS_JOB_SOURCE, BusMessage(
            body=job.SerializeToString(),
            correlation_id="wiring-corr-1",
        ))

        # Drain: the photo.process handler fires, publishes to photo.result,
        # and drain() continues to deliver that result to our collector above.
        built_bus.drain()  # type: ignore[attr-defined]

        n = len(results)
        assert n == 1, f"Expected 1 result on {PROCESS_RESULT_DEST!r}, got {n}"
        dest, msg = results[0]
        assert dest == PROCESS_RESULT_DEST

        result = processing_pb2.PhotoProcessingResult.FromString(msg.body)
        assert result.outcome == processing_pb2.PROCESSING_OUTCOME_SUCCEEDED, (
            f"Expected SUCCEEDED, got outcome={result.outcome}, error={result.error_message!r}"
        )
        assert result.job_id == "wiring-job-1"
        assert result.photo_id == "wiring-photo-1"
        assert result.correlation_id == "wiring-corr-1"
        assert msg.correlation_id == "wiring-corr-1"

    def test_build_returns_the_bus(self) -> None:
        """build() must return the bus object (so callers can call .start() or .drain())."""
        fake_store = FakeObjectStore()
        bus = InMemoryBus()
        config = _throwaway_config()

        result = build(
            config,
            store_factory=lambda c: fake_store,
            bus_factory=lambda c: bus,
        )

        assert result is bus
