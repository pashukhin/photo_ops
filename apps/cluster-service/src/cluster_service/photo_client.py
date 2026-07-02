"""photo-service ListPhotoSpacetime gRPC client (PhotoSpacetimeReader adapter).

Thin outbound IO adapter. Smoke-verified against the live photo-service; excluded
from unit coverage (logic is covered against the in-memory fakes).
"""
from __future__ import annotations

from collections.abc import Sequence

import grpc
from photo.v1 import photo_service_pb2, photo_service_pb2_grpc

from .codec import photo_point_from_proto
from .model import PhotoPoint


class PhotoServiceClient:  # pragma: no cover - live gRPC IO adapter (smoke-verified)
    def __init__(self, target: str) -> None:
        self._channel = grpc.insecure_channel(target)
        self._stub = photo_service_pb2_grpc.PhotoServiceStub(self._channel)

    def list_spacetime(self, user_id: str) -> Sequence[PhotoPoint]:
        response = self._stub.ListPhotoSpacetime(
            photo_service_pb2.ListPhotoSpacetimeRequest(user_id=user_id)
        )
        return [photo_point_from_proto(ps) for ps in response.photos]
