"""Clustering pipeline: the generic orchestration around a pluggable method.

partition (drop not-clusterable) → deterministic sort → method.cluster →
assemble root (+ not_clusterable bucket) → fingerprint. Methods never see the
not_clusterable concern; it is driven here by `descriptor.required_photo_fields`.
"""
from __future__ import annotations

from collections.abc import Callable, Sequence

from .model import ClusterTree, PhotoPoint

# proto field name -> PhotoPoint attribute that must be non-None for a photo to
# be clusterable under a method requiring that field.
_REQUIRED_FIELD_ATTRS: dict[str, str] = {
    "taken_at": "taken_at",
    "lat": "lat",
    "lon": "lon",
}


def partition(
    points: Sequence[PhotoPoint],
    required_fields: Sequence[str],
) -> tuple[list[PhotoPoint], list[PhotoPoint]]:
    """Split points into (clusterable, not_clusterable). A photo is clusterable
    iff every required field maps to a non-None attribute."""
    attrs = [_REQUIRED_FIELD_ATTRS[f] for f in required_fields]
    clusterable: list[PhotoPoint] = []
    unclusterable: list[PhotoPoint] = []
    for p in points:
        (clusterable if all(getattr(p, a) is not None for a in attrs) else unclusterable).append(p)
    return clusterable, unclusterable


def run_clustering(
    points: Sequence[PhotoPoint],
    method_id: str,
    params: dict,
    id_factory: Callable[[], str],
) -> ClusterTree:
    """Run one clustering method over `points` and return the full immutable tree.

    Contract (GREEN — photo_ops-9dk):
    - Resolve the method from the registry (unknown id → UnknownMethodError).
    - Merge `params` over the method's defaults.
    - partition() out not-clusterable photos by the method's required fields.
    - Sort the clusterable photos deterministically by (taken_at, photo_id).
    - method.cluster(...) yields the top-level clustered nodes.
    - Assemble a ROOT node over those nodes plus, if any, one NOT_CLUSTERABLE
      node holding the excluded photos as items; fill root aggregates.
    - fingerprint over ALL input points (incl. not_clusterable).
    - photo_count == len(points).
    """
    raise NotImplementedError("run_clustering — GREEN pending (photo_ops-9dk)")
