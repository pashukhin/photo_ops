"""Processing error taxonomy (photo_ops-0od): transient (retry) vs permanent (FAILED).

A transient storage hiccup (MinIO unreachable / 5xx / connection reset) must NOT be
turned into a permanent ``FAILED``; it is signalled with ``TransientProcessingError``
so the transport can bounded-retry it. Genuinely bad input (corrupt/unsupported image,
a truly-absent original) stays permanent.
"""
from __future__ import annotations

import minio.error
import urllib3.exceptions

# Server-side S3 codes worth retrying (throttling / transient availability). An
# ``S3Error`` carries an XML ``code``; a 5xx with no XML body is a ``ServerError``.
_TRANSIENT_S3_CODES = frozenset(
    {"SlowDown", "RequestTimeout", "ServiceUnavailable", "InternalError"}
)


class TransientProcessingError(Exception):
    """A retryable storage/IO hiccup — must NOT become a permanent FAILED."""


def classify_storage_error(exc: BaseException) -> bool:
    """True iff *exc* is a transient storage error (retryable), else False (permanent).

    Transient: ``urllib3`` HTTP errors (connection down / timeout / protocol — the
    headline "MinIO unreachable" case, which is NOT an ``S3Error``), ``ServerError``
    with a 5xx ``status_code``, and ``S3Error`` with a transient ``code``. Permanent:
    everything else (e.g. ``NoSuchKey``, image-decode errors).
    """
    if isinstance(exc, urllib3.exceptions.HTTPError):
        return True
    if isinstance(exc, minio.error.ServerError):
        return exc.status_code >= 500
    if isinstance(exc, minio.error.S3Error):
        return (exc.code or "") in _TRANSIENT_S3_CODES
    return False
