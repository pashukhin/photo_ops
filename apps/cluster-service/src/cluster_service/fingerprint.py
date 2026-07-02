"""Deterministic input fingerprint: the anchor for reproducibility + carry-over.

Two runs with the same method, the same resolved params, and the same set of
input photos (id + clustering-relevant attributes) share a fingerprint, so the
tree topology + membership are reproducible regardless of input ordering.
"""
from __future__ import annotations

import hashlib
import json
from collections.abc import Sequence

from .model import PhotoPoint


def input_fingerprint(method_id: str, params: dict, points: Sequence[PhotoPoint]) -> str:
    """A stable SHA-256 over (method, params, sorted photo attributes)."""
    photo_rows = sorted(
        [
            [
                p.photo_id,
                p.taken_at.isoformat() if p.taken_at is not None else None,
                p.lat,
                p.lon,
                p.camera_make,
                p.camera_model,
            ]
            for p in points
        ]
    )
    payload = json.dumps(
        {"method": method_id, "params": params, "photos": photo_rows},
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
