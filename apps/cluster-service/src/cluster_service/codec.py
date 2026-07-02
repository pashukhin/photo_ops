"""Codec: AMQP message bodies (job/result) and photo-proto → PhotoPoint.

`photo_point_from_proto` resolves the capture instant (utc preferred, else local)
and FLATTENS timezone to a single naive datetime — the mixed-tz approximation is
a documented seam (ТЗ §13). See tree.py for the naive-tz invariant.
"""
from __future__ import annotations

from datetime import datetime, timezone

from cluster.v1 import process_pb2
from photo.v1 import photo_service_pb2

from .model import PhotoPoint


def encode_job(
    *, result_id: str, user_id: str, method: str, params_json: str, correlation_id: str = ""
) -> bytes:
    return process_pb2.ClusterProcessJob(
        result_id=result_id,
        user_id=user_id,
        method=method,
        params_json=params_json,
        correlation_id=correlation_id,
    ).SerializeToString()


def decode_job(body: bytes) -> process_pb2.ClusterProcessJob:
    job = process_pb2.ClusterProcessJob()
    job.ParseFromString(body)
    return job


def encode_result(
    *,
    result_id: str,
    user_id: str,
    correlation_id: str,
    outcome: int,
    error_message: str = "",
) -> bytes:
    return process_pb2.ClusterProcessResult(
        result_id=result_id,
        user_id=user_id,
        correlation_id=correlation_id,
        outcome=outcome,
        error_message=error_message,
    ).SerializeToString()


def decode_result(body: bytes) -> process_pb2.ClusterProcessResult:
    result = process_pb2.ClusterProcessResult()
    result.ParseFromString(body)
    return result


def _resolve_taken_at(taken_at_utc: str, taken_at_local: str) -> datetime | None:
    """utc (flattened to naive UTC) → local (naive as-is) → None."""
    if taken_at_utc:
        dt = datetime.fromisoformat(taken_at_utc)
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt
    if taken_at_local:
        # local is a tz-less wall-clock; drop any stray offset so PhotoPoint.taken_at
        # stays naive (mixing an aware local with a naive utc would raise on compare).
        return datetime.fromisoformat(taken_at_local).replace(tzinfo=None)
    return None


def photo_point_from_proto(ps: photo_service_pb2.PhotoSpacetime) -> PhotoPoint:
    return PhotoPoint(
        photo_id=ps.photo_id,
        taken_at=_resolve_taken_at(ps.taken_at_utc, ps.taken_at_local),
        lat=ps.lat if ps.HasField("lat") else None,
        lon=ps.lon if ps.HasField("lon") else None,
        camera_make=ps.camera_make,
        camera_model=ps.camera_model,
    )
