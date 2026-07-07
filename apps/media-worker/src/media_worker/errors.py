"""Processing error taxonomy (photo_ops-0od): transient (retry) vs permanent (FAILED).

A transient storage hiccup (MinIO unreachable / 5xx / connection reset) must NOT be
turned into a permanent ``FAILED``; it is signalled with ``TransientProcessingError``
so the transport can bounded-retry it. Genuinely bad input (corrupt/unsupported image,
a truly-absent original) stays permanent.
"""
from __future__ import annotations


class TransientProcessingError(Exception):
    """A retryable storage/IO hiccup — must NOT become a permanent FAILED."""


def classify_storage_error(exc: BaseException) -> bool:
    """True iff *exc* is a transient storage error (retryable), else False (permanent).

    Transient: ``urllib3`` HTTP errors (connection down / timeout / protocol),
    ``minio.error.ServerError`` with a 5xx ``status_code``, and ``minio.error.S3Error``
    with a transient ``code`` (``SlowDown`` / ``RequestTimeout`` / ``ServiceUnavailable``
    / ``InternalError`` / any 5xx). Permanent: everything else (e.g. ``NoSuchKey``,
    image-decode errors).
    """
    raise NotImplementedError  # GREEN is the implementer's job
