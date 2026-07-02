"""photo-service ListPhotoSpacetime gRPC client (PhotoSpacetimeReader adapter).

Thin outbound IO adapter. GREEN (photo_ops-ecc): open a channel to
photo_service_grpc_url, call ListPhotoSpacetime(user_id), map each PhotoSpacetime
to a PhotoPoint via codec.photo_point_from_proto. Smoke-verified against the live
photo-service; excluded from unit coverage.
"""
from __future__ import annotations

from collections.abc import Sequence

from .model import PhotoPoint


class PhotoServiceClient:  # pragma: no cover - live gRPC IO adapter (smoke-verified)
    def __init__(self, target: str) -> None:
        self._target = target

    def list_spacetime(self, user_id: str) -> Sequence[PhotoPoint]:
        raise NotImplementedError("list_spacetime — GREEN pending (photo_ops-ecc)")
