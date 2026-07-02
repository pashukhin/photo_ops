from __future__ import annotations

from datetime import datetime

from cluster.v1 import process_pb2
from photo.v1 import photo_service_pb2

from cluster_service.codec import (
    decode_job,
    decode_result,
    encode_job,
    encode_result,
    photo_point_from_proto,
)


def test_job_roundtrip() -> None:
    body = encode_job(
        result_id="r1", user_id="u1", method="time_only", params_json="{}", correlation_id="c1"
    )
    job = decode_job(body)
    assert job.result_id == "r1"
    assert job.user_id == "u1"
    assert job.method == "time_only"
    assert job.correlation_id == "c1"


def test_result_roundtrip() -> None:
    body = encode_result(
        result_id="r1",
        user_id="u1",
        correlation_id="c1",
        outcome=process_pb2.CLUSTER_OUTCOME_SUCCEEDED,
        error_message="",
    )
    res = decode_result(body)
    assert res.result_id == "r1"
    assert res.outcome == process_pb2.CLUSTER_OUTCOME_SUCCEEDED


def test_photo_point_prefers_utc_and_flattens_tz() -> None:
    ps = photo_service_pb2.PhotoSpacetime(
        photo_id="p1",
        taken_at_utc="2024-06-15T15:30:00+03:00",  # 12:30 UTC
        taken_at_local="2024-06-15T15:30:00",
        camera_make="Canon",
        camera_model="EOS R5",
    )
    pt = photo_point_from_proto(ps)
    assert pt.taken_at == datetime(2024, 6, 15, 12, 30, 0)  # naive UTC
    assert pt.taken_at.tzinfo is None
    assert pt.camera_make == "Canon"


def test_photo_point_local_only() -> None:
    ps = photo_service_pb2.PhotoSpacetime(photo_id="p2", taken_at_local="2024-06-15T09:00:00")
    pt = photo_point_from_proto(ps)
    assert pt.taken_at == datetime(2024, 6, 15, 9, 0, 0)


def test_photo_point_local_offset_flattened_to_naive() -> None:
    # a stray offset on the tz-less local wall-clock is dropped (kept naive)
    ps = photo_service_pb2.PhotoSpacetime(photo_id="p", taken_at_local="2024-06-15T09:00:00+05:00")
    pt = photo_point_from_proto(ps)
    assert pt.taken_at == datetime(2024, 6, 15, 9, 0, 0)
    assert pt.taken_at.tzinfo is None


def test_photo_point_no_time_and_optional_coords() -> None:
    ps = photo_service_pb2.PhotoSpacetime(photo_id="p3")
    pt = photo_point_from_proto(ps)
    assert pt.taken_at is None
    assert pt.lat is None and pt.lon is None

    ps2 = photo_service_pb2.PhotoSpacetime(photo_id="p4", lat=55.75, lon=37.62)
    pt2 = photo_point_from_proto(ps2)
    assert pt2.lat == 55.75 and pt2.lon == 37.62
