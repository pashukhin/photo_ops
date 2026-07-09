"""Proto encode/decode helpers for the media-worker job pipeline."""
from __future__ import annotations

from dataclasses import dataclass

from src.photoops_proto.photo.v1 import processing_pb2

from .exif import Attributes
from .geocode import GeoPlace


@dataclass
class VariantResult:
    """Internal variant result dataclass (distinct from the proto VariantResult message)."""

    variant_type: str
    object_key: str
    width: int
    height: int
    size_bytes: int
    content_type: str


def decode_job(body: bytes) -> processing_pb2.ProcessPhotoJob:
    """Deserialize a ProcessPhotoJob from raw bytes."""
    m = processing_pb2.ProcessPhotoJob()
    m.ParseFromString(body)
    return m


def encode_result(
    *,
    job_id: str,
    photo_id: str,
    correlation_id: str,
    outcome: int,
    attributes: Attributes | None,
    variants: list[VariantResult],
    metadata_json: str,
    error_message: str = "",
    place: GeoPlace | None = None,
) -> bytes:
    """Serialize a PhotoProcessingResult to bytes."""
    result = processing_pb2.PhotoProcessingResult()
    result.job_id = job_id
    result.photo_id = photo_id
    result.correlation_id = correlation_id
    result.outcome = outcome  # type: ignore[assignment]
    result.error_message = error_message
    result.metadata_json = metadata_json

    if attributes is not None:
        result.attributes.width = attributes.width
        result.attributes.height = attributes.height
        result.attributes.taken_at_local = attributes.taken_at_local
        result.attributes.taken_at_utc = attributes.taken_at_utc
        result.attributes.taken_at_tz_source = attributes.taken_at_tz_source
        result.attributes.camera_make = attributes.camera_make
        result.attributes.camera_model = attributes.camera_model
        result.attributes.orientation = attributes.orientation
        # lat/lon are proto3 optional — only set when not None
        if attributes.lat is not None:
            result.attributes.lat = attributes.lat
        if attributes.lon is not None:
            result.attributes.lon = attributes.lon

        # place is a sub-message; setting any field vivifies it so HasField("place")
        # is True downstream. Absent (None) when there is no GPS / geocoder result.
        if place is not None:
            result.attributes.place.continent = place.continent
            result.attributes.place.country = place.country
            result.attributes.place.region = place.region
            result.attributes.place.city = place.city
            result.attributes.place.district = place.district
            result.attributes.place.raw_provider_data = place.raw_provider_data

    for v in variants:
        result.variants.add(
            variant_type=v.variant_type,
            object_key=v.object_key,
            width=v.width,
            height=v.height,
            size_bytes=v.size_bytes,
            content_type=v.content_type,
        )

    return result.SerializeToString()
