"""Outbound ports the worker depends on (fakes in tests, real adapters in wiring)."""
from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol

from .model import PhotoPoint


class PhotoSpacetimeReader(Protocol):
    """Reads the space-time + device attributes of a user's `ready` photos
    (photo-service ListPhotoSpacetime)."""

    def list_spacetime(self, user_id: str) -> Sequence[PhotoPoint]: ...
