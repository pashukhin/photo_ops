"""RED (photo_ops-0od): transient/permanent taxonomy + bounded-retry arithmetic.

The classifier is a pure function so it is unit-covered against the REAL exception
types the minio client raises (media-worker has no coverage omit list); the raw-pika
republish wiring stays smoke-verified.
"""
from __future__ import annotations

import minio.error
import urllib3.exceptions

from src.media_worker.errors import TransientProcessingError, classify_storage_error
from src.media_worker.messaging.retry import (
    MAX_RETRY_ATTEMPTS,
    requeue_on,
    retry_attempt,
    should_retry,
)


def _s3_error(code: str) -> minio.error.S3Error:
    # S3Error(response, code, message, resource, request_id, host_id)
    return minio.error.S3Error(None, code, "msg", "res", "req", "host")


def test_transient_connection_down_is_transient() -> None:
    # why: MinIO-unreachable surfaces as urllib3, NOT S3Error — the headline transient.
    mre = urllib3.exceptions.MaxRetryError(pool=None, url="http://x")
    assert classify_storage_error(mre) is True
    assert classify_storage_error(urllib3.exceptions.ProtocolError("connection reset")) is True


def test_transient_server_5xx_is_transient() -> None:
    # why: a 5xx without an XML body is minio.error.ServerError (base MinioException,
    # NOT S3Error) — must be caught on its own.
    assert classify_storage_error(minio.error.ServerError("boom", 503)) is True


def test_transient_s3_throttle_codes_are_transient() -> None:
    # why: server-side S3 throttling/availability codes are retryable.
    assert classify_storage_error(_s3_error("SlowDown")) is True
    assert classify_storage_error(_s3_error("ServiceUnavailable")) is True


def test_permanent_inputs_are_not_transient() -> None:
    # why: a genuinely-absent original and a bad image are permanent — retry won't help.
    assert classify_storage_error(_s3_error("NoSuchKey")) is False
    assert classify_storage_error(ValueError("cannot identify image file")) is False


def test_requeue_on_only_transient_marker() -> None:
    # why: the transport requeues ONLY our typed transient signal; everything else → DLQ.
    assert requeue_on(TransientProcessingError("x")) is True
    assert requeue_on(ValueError("x")) is False


def test_retry_attempt_reads_header_default_zero() -> None:
    # why: a first delivery has no header → attempt 0; the stamped header carries the count.
    assert retry_attempt(None) == 0
    assert retry_attempt({}) == 0
    assert retry_attempt({"x-attempt": 3}) == 3


def test_retry_attempt_tolerates_malformed_header() -> None:
    # why: a malformed/externally-set value must not raise into a DLQ nack — treat as 0.
    assert retry_attempt({"x-attempt": "oops"}) == 0  # non-numeric str → ValueError
    assert retry_attempt({"x-attempt": None}) == 0  # None → TypeError


def test_should_retry_is_bounded() -> None:
    # why: bounded — retry below the cap, give up (→ FAILED) at/above it. No infinite requeue.
    assert should_retry({"x-attempt": 0}, MAX_RETRY_ATTEMPTS) is True
    assert should_retry({"x-attempt": MAX_RETRY_ATTEMPTS - 1}, MAX_RETRY_ATTEMPTS) is True
    assert should_retry({"x-attempt": MAX_RETRY_ATTEMPTS}, MAX_RETRY_ATTEMPTS) is False
