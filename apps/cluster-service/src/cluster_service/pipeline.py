"""Clustering pipeline: the generic orchestration around a pluggable method.

partition (drop not-clusterable) → deterministic sort → method.cluster →
assemble root (+ not_clusterable bucket) → fingerprint. Methods never see the
not_clusterable concern; it is driven here by `descriptor.required_photo_fields`.
"""
from __future__ import annotations

from collections.abc import Callable, Sequence
from datetime import datetime

from .fingerprint import input_fingerprint
from .methods.base import get
from .model import ClusterTree, NodeKind, PhotoPoint, TreeNode
from .tree import pick_cover, time_span

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

    Generic assembly (the algorithm lives in method.cluster): resolve the method,
    partition out not-clusterable photos, deterministically order the rest, let the
    method build the top-level nodes, then wrap them (plus a NOT_CLUSTERABLE bucket)
    under a ROOT with subtree aggregates and an input fingerprint.
    """
    method = get(method_id)  # unknown id → UnknownMethodError
    merged = {**method.descriptor.default_params, **params}
    clusterable, unclusterable = partition(points, method.descriptor.required_photo_fields)
    ordered = sorted(
        clusterable,
        key=lambda p: (p.taken_at is None, p.taken_at or datetime.min, p.photo_id),
    )

    children: list[TreeNode] = list(method.cluster(ordered, merged, id_factory))

    if unclusterable:
        excluded = sorted(unclusterable, key=lambda p: p.photo_id)
        children.append(
            TreeNode(
                id=id_factory(),
                kind=NodeKind.NOT_CLUSTERABLE,
                photo_count=len(excluded),
                cover_photo_id=pick_cover(excluded),
                items=[p.photo_id for p in excluded],
            )
        )

    date_from, date_to = time_span(points)
    root = TreeNode(
        id=id_factory(),
        kind=NodeKind.ROOT,
        photo_count=len(points),
        date_from=date_from,
        date_to=date_to,
        cover_photo_id=pick_cover(clusterable) or pick_cover(points),
        children=children,
    )
    return ClusterTree(
        root=root,
        input_fingerprint=input_fingerprint(method_id, merged, points),
        photo_count=len(points),
    )
