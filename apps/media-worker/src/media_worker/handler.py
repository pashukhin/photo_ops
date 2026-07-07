"""Job handler: claim → process → publish result."""
from __future__ import annotations

import logging

from src.photoops_proto.photo.v1.processing_pb2 import (
    PROCESSING_OUTCOME_FAILED,
    PROCESSING_OUTCOME_SUCCEEDED,
    ProcessPhotoJob,
)

from .codec import VariantResult, decode_job, encode_result
from .errors import TransientProcessingError
from .exif import extract_attributes
from .geocode import reverse_geocode
from .imaging import RENDITIONS, render_variant
from .logging_setup import bind_job_context, clear_job_context
from .messaging.port import BusMessage, MessagePublisher
from .messaging.retry import MAX_RETRY_ATTEMPTS, should_retry
from .storage import ObjectStore

log = logging.getLogger(__name__)


class JobHandler:
    """Orchestrates claim → process → publish for a single ProcessPhotoJob message."""

    def __init__(
        self,
        store: ObjectStore,
        publisher: MessagePublisher,
        result_dest: str = "photo.result",
    ) -> None:
        self._store = store
        self._publisher = publisher
        self._result_dest = result_dest

    def handle(self, message: BusMessage) -> None:
        bind_job_context(message.correlation_id)
        try:
            self._handle(message)
        finally:
            clear_job_context()

    def _handle(self, message: BusMessage) -> None:
        """Handle one BusMessage carrying a serialized ProcessPhotoJob.

        A permanent/expected failure (bad image, missing object, decode error) is
        caught and published as a FAILED result, returning normally so one photo's
        failure does not crash the consumer. A TRANSIENT storage error
        (photo_ops-0od) instead propagates so the transport can bounded-retry it;
        only once the retry cap is reached is it given up as a permanent FAILED.
        """
        # Decode first — a malformed body must also be caught and published as FAILED.
        try:
            job = decode_job(message.body)
        except Exception as exc:
            log.error("job.failed", extra={"job_id": "", "photo_id": "", "error": str(exc)})
            self._publish_failed(
                job_id="",
                photo_id="",
                correlation_id=message.correlation_id,
                error_message=str(exc),
            )
            return

        try:
            self._process(job)
        except TransientProcessingError as exc:
            # Transient storage error (MinIO unreachable / 5xx / reset). Retry via the
            # transport (bounded by x-attempt) rather than failing the photo; only after
            # the cap give up as a permanent FAILED so it does not stay in processing.
            if should_retry(message.headers, MAX_RETRY_ATTEMPTS):
                raise  # transport republishes with x-attempt+1 and acks the original
            log.error(
                "job.failed.transient_giveup",
                extra={"job_id": job.job_id, "photo_id": job.photo_id, "error": str(exc)},
            )
            self._publish_failed(
                job_id=job.job_id,
                photo_id=job.photo_id,
                correlation_id=job.correlation_id,
                error_message=f"transient storage error persisted after retries: {exc}",
            )
        except Exception as exc:
            log.error(
                "job.failed",
                extra={"job_id": job.job_id, "photo_id": job.photo_id, "error": str(exc)},
            )
            self._publish_failed(
                job_id=job.job_id,
                photo_id=job.photo_id,
                correlation_id=job.correlation_id,
                error_message=str(exc),
            )

    def _publish_failed(
        self, *, job_id: str, photo_id: str, correlation_id: str, error_message: str
    ) -> None:
        """Publish a permanent FAILED result (acked by the transport)."""
        body = encode_result(
            job_id=job_id,
            photo_id=photo_id,
            correlation_id=correlation_id,
            outcome=PROCESSING_OUTCOME_FAILED,
            attributes=None,
            variants=[],
            metadata_json="",
            error_message=error_message,
        )
        self._publisher.publish(
            self._result_dest,
            BusMessage(body=body, correlation_id=correlation_id),
        )

    def _process(self, job: ProcessPhotoJob) -> None:
        """Core processing — raises on any error (caught by _handle())."""
        # Deterministic object keys for variants
        keys: dict[str, str] = {
            vt: f"variants/{job.photo_id}/{vt}.jpg"
            for vt in RENDITIONS
        }

        # ----- Claim check -----
        heads: dict[str, dict[str, str] | None] = {
            vt: self._store.head(k) for vt, k in keys.items()
        }
        claimed = all(
            h is not None and h.get("job-id") == job.job_id
            for h in heads.values()
        )

        variants: list[VariantResult] = []

        if claimed:
            # Reconstruct from stored metadata — no re-encoding
            for vt, key in keys.items():
                h = heads[vt]
                assert h is not None  # guaranteed by claimed check
                variants.append(
                    VariantResult(
                        variant_type=vt,
                        object_key=key,
                        width=int(h["width"]),
                        height=int(h["height"]),
                        size_bytes=int(h["size"]),
                        content_type="image/jpeg",
                    )
                )
        else:
            # Normal path: download original, render each rendition, upload
            original = self._store.download(job.object_key)
            for vt, box in RENDITIONS.items():
                rv = render_variant(original, box)
                meta: dict[str, str] = {
                    "job-id": job.job_id,
                    "width": str(rv.width),
                    "height": str(rv.height),
                    "size": str(len(rv.data)),
                }
                size = self._store.upload(keys[vt], rv.data, rv.content_type, meta)
                variants.append(
                    VariantResult(
                        variant_type=vt,
                        object_key=keys[vt],
                        width=rv.width,
                        height=rv.height,
                        size_bytes=size,
                        content_type=rv.content_type,
                    )
                )
            # Re-read original for EXIF (already downloaded above)
            attrs = extract_attributes(original)

        # When we took the claimed path, we still need to extract attributes
        # (cheap EXIF re-read of the already-in-memory original on normal path
        # is handled above; claim path needs its own download).
        if claimed:
            original = self._store.download(job.object_key)
            attrs = extract_attributes(original)

        log.info(
            "job.succeeded",
            extra={
                "job_id": job.job_id,
                "photo_id": job.photo_id,
                "variants": [v.variant_type for v in variants],
            },
        )

        # Reverse-geocode the extracted coordinates (offline; None when no GPS or
        # the geocoder yields nothing — processing continues either way, §3.4).
        place = reverse_geocode(attrs.lat, attrs.lon)

        body = encode_result(
            job_id=job.job_id,
            photo_id=job.photo_id,
            correlation_id=job.correlation_id,
            outcome=PROCESSING_OUTCOME_SUCCEEDED,
            attributes=attrs,
            variants=variants,
            metadata_json=attrs.metadata_json,
            place=place,
        )
        self._publisher.publish(
            self._result_dest,
            BusMessage(body=body, correlation_id=job.correlation_id),
        )
