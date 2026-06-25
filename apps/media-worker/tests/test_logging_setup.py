import json
import logging

from src.media_worker.logging_setup import (
    JsonLogFormatter,
    bind_job_context,
    clear_job_context,
    trace_id_from_traceparent,
)


def format_record(msg: str, extra: dict | None = None) -> dict:
    logger = logging.getLogger("test")
    record = logger.makeRecord("test", logging.INFO, __file__, 0, msg, (), None)
    for k, v in (extra or {}).items():
        setattr(record, k, v)
    return json.loads(JsonLogFormatter().format(record))


def test_trace_id_from_traceparent():
    tp = "00-" + "a" * 32 + "-" + "b" * 16 + "-01"
    assert trace_id_from_traceparent(tp) == "a" * 32
    assert trace_id_from_traceparent("") == ""
    assert trace_id_from_traceparent("garbage") == ""


def test_formatter_envelope():
    clear_job_context()
    out = format_record("job.started", {"job_id": "j1"})
    assert out["msg"] == "job.started"
    assert out["level"] == "info"
    assert out["service"] == "media-worker"
    assert out["job_id"] == "j1"
    assert out["trace_id"] == ""
    assert out["correlation_id"] == ""


def test_bind_job_context_sets_ids():
    tp = "00-" + "c" * 32 + "-" + "d" * 16 + "-01"
    bind_job_context(tp)
    try:
        out = format_record("job.succeeded")
        assert out["correlation_id"] == tp
        assert out["trace_id"] == "c" * 32
    finally:
        clear_job_context()
