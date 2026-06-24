"""Job handler: claim → process → publish result."""
from __future__ import annotations

import json
import logging

from src.photoops_proto.photo.v1.processing_pb2 import (
    PROCESSING_OUTCOME_FAILED,
    PROCESSING_OUTCOME_SUCCEEDED,
    ProcessPhotoJob,
)

from .codec import VariantResult, decode_job, encode_result
from .exif import extract_attributes
from .imaging import RENDITIONS, render_variant
from .messaging.port import BusMessage, MessagePublisher
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
        """Handle one BusMessage carrying a serialized ProcessPhotoJob.

        On any exception the failure is caught, a FAILED result is published,
        and the method returns normally — one photo's failure must not propagate.
        """
        # Decode first — a malformed body must also be caught and published as FAILED.
        try:
            job = decode_job(message.body)
        except Exception as exc:
            log.error(
                json.dumps(
                    {
                        "level": "error",
                        "correlation_id": message.correlation_id,
                        "job_id": "",
                        "photo_id": "",
                        "outcome": "failed",
                        "error": str(exc),
                    }
                )
            )
            body = encode_result(
                job_id="",
                photo_id="",
                correlation_id=message.correlation_id,
                outcome=PROCESSING_OUTCOME_FAILED,
                attributes=None,
                variants=[],
                metadata_json="",
                error_message=str(exc),
            )
            self._publisher.publish(
                self._result_dest,
                BusMessage(body=body, correlation_id=message.correlation_id),
            )
            return

        try:
            self._process(job)
        except Exception as exc:
            # Structured failure log
            log.error(
                json.dumps(
                    {
                        "level": "error",
                        "correlation_id": job.correlation_id,
                        "job_id": job.job_id,
                        "photo_id": job.photo_id,
                        "outcome": "failed",
                        "error": str(exc),
                    }
                )
            )
            body = encode_result(
                job_id=job.job_id,
                photo_id=job.photo_id,
                correlation_id=job.correlation_id,
                outcome=PROCESSING_OUTCOME_FAILED,
                attributes=None,
                variants=[],
                metadata_json="",
                error_message=str(exc),
            )
            self._publisher.publish(
                self._result_dest,
                BusMessage(body=body, correlation_id=job.correlation_id),
            )

    def _process(self, job: ProcessPhotoJob) -> None:
        """Core processing — raises on any error (caught by handle())."""
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

        # Structured success log
        log.info(
            json.dumps(
                {
                    "level": "info",
                    "correlation_id": job.correlation_id,
                    "job_id": job.job_id,
                    "photo_id": job.photo_id,
                    "outcome": "succeeded",
                    "variants": [v.variant_type for v in variants],
                }
            )
        )

        body = encode_result(
            job_id=job.job_id,
            photo_id=job.photo_id,
            correlation_id=job.correlation_id,
            outcome=PROCESSING_OUTCOME_SUCCEEDED,
            attributes=attrs,
            variants=variants,
            metadata_json=attrs.metadata_json,
        )
        self._publisher.publish(
            self._result_dest,
            BusMessage(body=body, correlation_id=job.correlation_id),
        )
