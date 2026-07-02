from __future__ import annotations

import itertools
from collections.abc import Callable
from datetime import datetime, timedelta

import pytest

from cluster_service.methods import base
from cluster_service.methods.base import ClusteringMethod, MethodDescriptor
from cluster_service.model import NodeKind, PhotoPoint, TreeNode

# A fixed naive base instant; PhotoPoint.taken_at is naive (tz flattened by codec).
BASE = datetime(2024, 6, 15, 12, 0, 0)


def make_point(
    pid: str,
    minutes: float | None = 0.0,
    make: str = "Canon",
    model: str = "EOS R5",
    lat: float | None = None,
    lon: float | None = None,
) -> PhotoPoint:
    """Build a PhotoPoint at BASE + `minutes` (None minutes → no capture time)."""
    taken = BASE + timedelta(minutes=minutes) if minutes is not None else None
    return PhotoPoint(
        photo_id=pid, taken_at=taken, lat=lat, lon=lon, camera_make=make, camera_model=model
    )


@pytest.fixture
def id_factory() -> Callable[[], str]:
    """Deterministic node-id factory for stable tree comparisons."""
    counter = itertools.count()
    return lambda: f"n{next(counter)}"


class FakeMethod(ClusteringMethod):
    """A trivial deterministic method for exercising the generic pipeline/worker
    assembly without depending on the (RED) real algorithm: one LEAF per point
    under a single SEGMENT node."""

    @property
    def descriptor(self) -> MethodDescriptor:
        return MethodDescriptor(
            id="fake",
            display_name="Fake",
            description="test method",
            required_photo_fields=("taken_at",),
            default_params={},
        )

    def cluster(self, points, params, id_factory):
        leaves = [
            TreeNode(
                id=id_factory(),
                kind=NodeKind.LEAF,
                photo_count=1,
                cover_photo_id=p.photo_id,
                items=[p.photo_id],
            )
            for p in points
        ]
        return [
            TreeNode(
                id=id_factory(),
                kind=NodeKind.SEGMENT,
                segment_label="fake",
                photo_count=len(points),
                children=leaves,
            )
        ]


@pytest.fixture
def fake_method():
    """Register FakeMethod for the duration of a test, then remove it so the
    global registry (asserted by test_methods) is left clean."""
    method = FakeMethod()
    base.register(method)
    yield method
    base._REGISTRY.pop(method.descriptor.id, None)


def collect_items(node: TreeNode) -> list[str]:
    """All photo_ids under a node (its items + descendants'), sorted."""
    acc = list(node.items)
    for child in node.children:
        acc.extend(collect_items(child))
    return sorted(acc)


def shape(node: TreeNode) -> tuple:
    """Id-independent projection of a node for determinism comparison:
    (kind, segment_label, sorted own items, child shapes in order)."""
    return (
        node.kind,
        node.segment_label,
        tuple(sorted(node.items)),
        tuple(shape(c) for c in node.children),
    )
