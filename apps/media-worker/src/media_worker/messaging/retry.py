"""Bounded-retry arithmetic for the transient-requeue path (photo_ops-0od).

Pure helpers so the retry decision is unit-covered; the actual raw-pika republish
(reading/stamping the ``x-attempt`` header, ack/nack) lives in ``rabbitmq.py`` and is
``# pragma: no cover`` (smoke-verified). ``MAX_RETRY_ATTEMPTS`` is named distinctly to
avoid colliding with ``in_memory.py``'s unrelated ``MAX_ATTEMPTS``.
"""
from __future__ import annotations

from ..errors import TransientProcessingError

MAX_RETRY_ATTEMPTS = 5


def requeue_on(exc: BaseException) -> bool:
    """True iff *exc* is the typed transient signal that should be redelivered."""
    return isinstance(exc, TransientProcessingError)


def retry_attempt(headers: dict | None) -> int:
    """The current attempt count carried in the message header (0 on first delivery)."""
    if not headers:
        return 0
    return int(headers.get("x-attempt", 0))


def should_retry(headers: dict | None, max_attempts: int) -> bool:
    """True iff another bounded retry is allowed (attempt < max_attempts)."""
    return retry_attempt(headers) < max_attempts
