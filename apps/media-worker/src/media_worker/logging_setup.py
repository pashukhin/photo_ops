"""Structured JSON logging for the media-worker.

A dependency-free stdlib formatter emits one JSON object per record with a
consistent envelope (service/level/time/msg) plus the contextvars-bound
correlation_id/trace_id and any `extra` fields. bind_job_context() is called
at the start of handling a job so every line for that job is correlated.
"""
from __future__ import annotations

import contextvars
import json
import logging
import os
from typing import Any

_SERVICE = "media-worker"
_correlation_id: contextvars.ContextVar[str] = contextvars.ContextVar("correlation_id", default="")
_trace_id: contextvars.ContextVar[str] = contextvars.ContextVar("trace_id", default="")

# Standard LogRecord attributes we do NOT copy into the JSON envelope as extras.
_RESERVED = set(logging.makeLogRecord({}).__dict__) | {"message", "asctime", "taskName"}


def trace_id_from_traceparent(traceparent: str) -> str:
    """Extract the 32-hex trace id from a W3C traceparent, or '' if malformed."""
    parts = traceparent.split("-")
    if len(parts) == 4 and len(parts[1]) == 32:
        return parts[1]
    return ""


def bind_job_context(correlation_id: str) -> None:
    """Bind the job's correlation id (a W3C traceparent) for subsequent logs."""
    _correlation_id.set(correlation_id or "")
    _trace_id.set(trace_id_from_traceparent(correlation_id or ""))


def clear_job_context() -> None:
    _correlation_id.set("")
    _trace_id.set("")


class JsonLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "time": int(record.created * 1000),
            "level": record.levelname.lower(),
            "service": _SERVICE,
            "msg": record.getMessage(),
            "trace_id": _trace_id.get(),
            "correlation_id": _correlation_id.get(),
        }
        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["error"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def setup_logging(service: str = _SERVICE) -> None:
    """Configure the root logger to emit JSON at LOG_LEVEL (default INFO)."""
    level = os.getenv("LOG_LEVEL", "info").upper()
    handler = logging.StreamHandler()
    handler.setFormatter(JsonLogFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)
