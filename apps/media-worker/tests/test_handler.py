"""TDD tests for the job handler: claim → process → publish result."""
from __future__ import annotations

import io
import unittest.mock as mock

import pytest
from PIL import Image

from src.media_worker.errors import TransientProcessingError
from src.media_worker.handler import JobHandler
from src.media_worker.messaging.in_memory import BusMessage, InMemoryBus
from src.media_worker.messaging.retry import MAX_RETRY_ATTEMPTS
from src.photoops_proto.photo.v1 import processing_pb2
from tests.fakes import FakeObjectStore, RaisingObjectStore

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_jpeg(width: int = 640, height: int = 480) -> bytes:
    """Build a minimal in-memory JPEG for testing."""
    buf = io.BytesIO()
    img = Image.new("RGB", (width, height), color=(100, 150, 200))
    img.save(buf, format="JPEG")
    return buf.getvalue()


def _make_job(
    job_id: str = "job-1",
    photo_id: str = "photo-1",
    object_key: str = "originals/photo-1.jpg",
    correlation_id: str = "corr-1",
) -> processing_pb2.ProcessPhotoJob:
    return processing_pb2.ProcessPhotoJob(
        job_id=job_id,
        photo_id=photo_id,
        user_id="user-1",
        object_key=object_key,
        correlation_id=correlation_id,
    )


def _decode_result(published: BusMessage) -> processing_pb2.PhotoProcessingResult:
    return processing_pb2.PhotoProcessingResult.FromString(published.body)


def _drain_results(bus: InMemoryBus) -> list[tuple[str, BusMessage]]:
    """Drain queued messages from the bus WITHOUT dispatching through handlers."""
    results = []
    while bus._queue:  # noqa: SLF001  # test access to internal queue
        results.append(bus._queue.popleft())
    return results


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestHandlerSuccess:
    """Happy-path: original is a valid JPEG; two variants written and SUCCEEDED result published."""

    def test_two_variants_written_and_succeeded_result_published(self) -> None:
        store = FakeObjectStore()
        bus = InMemoryBus()
        handler = JobHandler(store=store, publisher=bus)

        job = _make_job()
        original_jpeg = _make_jpeg(640, 480)
        store._store["originals/photo-1.jpg"] = (original_jpeg, "image/jpeg", {})

        handler.handle(BusMessage(body=job.SerializeToString(), correlation_id="corr-1"))

        # Both variant objects must be present
        thumb_key = "variants/photo-1/thumbnail.jpg"
        preview_key = "variants/photo-1/preview.jpg"
        assert thumb_key in store._store, "thumbnail not written"
        assert preview_key in store._store, "preview not written"

        # Exactly one result published
        published = _drain_results(bus)
        assert len(published) == 1
        dest, msg = published[0]
        assert dest == "photo.result"

        result = _decode_result(msg)
        assert result.outcome == processing_pb2.PROCESSING_OUTCOME_SUCCEEDED
        assert result.job_id == "job-1"
        assert result.photo_id == "photo-1"
        assert result.correlation_id == "corr-1"

        # Two variants with sensible dimensions
        assert len(result.variants) == 2
        vt_map = {v.variant_type: v for v in result.variants}
        assert "thumbnail" in vt_map
        assert "preview" in vt_map
        assert vt_map["thumbnail"].width > 0
        assert vt_map["thumbnail"].height > 0
        assert vt_map["preview"].width > 0
        assert vt_map["preview"].height > 0
        assert vt_map["thumbnail"].size_bytes > 0
        assert vt_map["preview"].size_bytes > 0

        # BusMessage correlation_id must match
        assert msg.correlation_id == "corr-1"


class TestHandlerClaimSkip:
    """Claim path: both variants already exist with the same job-id → render_variant NOT called."""

    def test_no_double_encode_when_claim_holds(self) -> None:
        store = FakeObjectStore()
        bus = InMemoryBus()
        handler = JobHandler(store=store, publisher=bus)

        job = _make_job(job_id="job-42", photo_id="photo-2", object_key="originals/photo-2.jpg")
        original_jpeg = _make_jpeg(800, 600)
        store._store["originals/photo-2.jpg"] = (original_jpeg, "image/jpeg", {})

        # Pre-seed both variant keys with the same job-id (simulate already-processed)
        thumb_key = "variants/photo-2/thumbnail.jpg"
        preview_key = "variants/photo-2/preview.jpg"
        store._store[thumb_key] = (
            b"\xff\xd8\xff" + b"\x00" * 10,  # fake JPEG bytes
            "image/jpeg",
            {"job-id": "job-42", "width": "320", "height": "240", "size": "1234"},
        )
        store._store[preview_key] = (
            b"\xff\xd8\xff" + b"\x00" * 50,
            "image/jpeg",
            {"job-id": "job-42", "width": "1600", "height": "1200", "size": "5678"},
        )

        with mock.patch("src.media_worker.handler.render_variant") as mock_rv:
            mock_rv.side_effect = AssertionError("render_variant must not be called on claim hit")
            handler.handle(BusMessage(body=job.SerializeToString(), correlation_id="corr-42"))

        mock_rv.assert_not_called()

        # A SUCCEEDED result must still be published with 2 variants reconstructed from metadata
        published = _drain_results(bus)
        assert len(published) == 1
        dest, msg = published[0]
        assert dest == "photo.result"

        result = _decode_result(msg)
        assert result.outcome == processing_pb2.PROCESSING_OUTCOME_SUCCEEDED
        assert len(result.variants) == 2

        vt_map = {v.variant_type: v for v in result.variants}
        assert vt_map["thumbnail"].width == 320
        assert vt_map["thumbnail"].height == 240
        assert vt_map["thumbnail"].size_bytes == 1234
        assert vt_map["preview"].width == 1600
        assert vt_map["preview"].height == 1200
        assert vt_map["preview"].size_bytes == 5678


class TestHandlerFailure:
    """Failure path: non-image original → FAILED result published with non-empty error_message."""

    def test_non_image_original_yields_failed_result(self) -> None:
        store = FakeObjectStore()
        bus = InMemoryBus()
        handler = JobHandler(store=store, publisher=bus)

        job = _make_job(photo_id="photo-bad", object_key="originals/bad.jpg")
        store._store["originals/bad.jpg"] = (b"not an image", "image/jpeg", {})

        # Must NOT raise — failure is swallowed and published as FAILED result
        handler.handle(BusMessage(body=job.SerializeToString(), correlation_id="corr-bad"))

        published = _drain_results(bus)
        assert len(published) == 1
        dest, msg = published[0]
        assert dest == "photo.result"

        result = _decode_result(msg)
        assert result.outcome == processing_pb2.PROCESSING_OUTCOME_FAILED
        assert result.error_message, "error_message must not be empty on failure"
        assert result.job_id == "job-1"
        assert result.photo_id == "photo-bad"

    def test_missing_original_yields_failed_result(self) -> None:
        """Download failure (missing object_key) must also yield FAILED, not raise."""
        store = FakeObjectStore()
        bus = InMemoryBus()
        handler = JobHandler(store=store, publisher=bus)

        job = _make_job(photo_id="photo-missing", object_key="originals/missing.jpg")
        # Do NOT seed the store — download will raise FileNotFoundError

        handler.handle(BusMessage(body=job.SerializeToString(), correlation_id="corr-miss"))

        published = _drain_results(bus)
        assert len(published) == 1
        _, msg = published[0]
        result = _decode_result(msg)
        assert result.outcome == processing_pb2.PROCESSING_OUTCOME_FAILED
        assert result.error_message

    def test_malformed_body_yields_failed_result_and_does_not_raise(self) -> None:
        """A corrupt/truncated protobuf body must publish FAILED without raising."""
        store = FakeObjectStore()
        bus = InMemoryBus()
        handler = JobHandler(store=store, publisher=bus)

        # Must NOT raise — decode failure is caught and published as FAILED
        handler.handle(BusMessage(body=b"not-a-valid-protobuf", correlation_id="c"))

        published = _drain_results(bus)
        assert len(published) == 1
        _, msg = published[0]
        result = _decode_result(msg)
        assert result.outcome == processing_pb2.PROCESSING_OUTCOME_FAILED
        assert result.error_message, "error_message must not be empty on decode failure"


class TestHandlerTransientVsPermanent:
    """photo_ops-0od: a transient storage error must propagate (redeliverable), not be
    turned into a permanent FAILED; a permanent error still publishes FAILED."""

    def test_transient_error_propagates_and_publishes_no_failed(self) -> None:
        # why (0od): a transient storage hiccup must NOT become a permanent FAILED; it
        # propagates so the transport can bounded-retry. Current _handle catches all →
        # publishes FAILED and swallows → RED.
        store = RaisingObjectStore(TransientProcessingError("minio down"))
        bus = InMemoryBus()
        handler = JobHandler(store=store, publisher=bus)

        msg = BusMessage(body=_make_job().SerializeToString(), correlation_id="corr-t")
        with pytest.raises(TransientProcessingError):
            handler.handle(msg)

        assert _drain_results(bus) == []  # no FAILED result emitted

    def test_permanent_error_publishes_failed(self) -> None:
        # why (0od): genuinely bad input stays a permanent FAILED (acked, no redelivery).
        store = RaisingObjectStore(ValueError("cannot identify image file"))
        bus = InMemoryBus()
        handler = JobHandler(store=store, publisher=bus)

        handler.handle(BusMessage(body=_make_job().SerializeToString(), correlation_id="corr-p"))

        published = _drain_results(bus)
        assert len(published) == 1
        _, msg = published[0]
        assert _decode_result(msg).outcome == processing_pb2.PROCESSING_OUTCOME_FAILED

    def test_transient_error_gives_up_as_failed_at_retry_cap(self) -> None:
        # why (0od): bounded — once x-attempt reaches the cap, a persistent transient
        # error becomes a permanent FAILED so the photo does not stay in 'processing'.
        store = RaisingObjectStore(TransientProcessingError("minio still down"))
        bus = InMemoryBus()
        handler = JobHandler(store=store, publisher=bus)

        msg = BusMessage(
            body=_make_job().SerializeToString(),
            correlation_id="corr-giveup",
            headers={"x-attempt": MAX_RETRY_ATTEMPTS},
        )
        handler.handle(msg)  # must NOT raise at the cap

        published = _drain_results(bus)
        assert len(published) == 1
        _, out = published[0]
        assert _decode_result(out).outcome == processing_pb2.PROCESSING_OUTCOME_FAILED
