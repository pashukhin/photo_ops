from __future__ import annotations

import pytest
from conftest import collect_items, make_point, shape

from cluster_service.errors import UnknownMethodError
from cluster_service.fingerprint import input_fingerprint
from cluster_service.model import NodeKind
from cluster_service.pipeline import partition, run_clustering


def test_partition_time_only() -> None:
    pts = [make_point("a", minutes=0), make_point("u", minutes=None)]
    clusterable, unclusterable = partition(pts, ("taken_at",))
    assert [p.photo_id for p in clusterable] == ["a"]
    assert [p.photo_id for p in unclusterable] == ["u"]


def test_partition_spacetime_requires_coords() -> None:
    pts = [
        make_point("full", minutes=0, lat=55.75, lon=37.62),
        make_point("nogeo", minutes=0, lat=None, lon=None),
    ]
    clusterable, unclusterable = partition(pts, ("taken_at", "lat", "lon"))
    assert [p.photo_id for p in clusterable] == ["full"]
    assert [p.photo_id for p in unclusterable] == ["nogeo"]


def test_input_fingerprint_order_independent_and_sensitive() -> None:
    a = make_point("a", minutes=0)
    b = make_point("b", minutes=5)
    fp1 = input_fingerprint("time_only", {}, [a, b])
    fp2 = input_fingerprint("time_only", {}, [b, a])  # shuffled
    assert fp1 == fp2
    # different params → different fingerprint
    assert input_fingerprint("time_only", {"linkage": "complete"}, [a, b]) != fp1
    # different input set → different fingerprint
    assert input_fingerprint("time_only", {}, [a]) != fp1


def test_run_clustering_not_clusterable_bucket(id_factory) -> None:
    pts = [
        make_point("a", minutes=0),
        make_point("b", minutes=2),
        make_point("u", minutes=None),  # no time → not clusterable
    ]
    tree = run_clustering(pts, "time_only", {}, id_factory)
    assert tree.root.kind == NodeKind.ROOT
    assert tree.photo_count == 3
    nc = [c for c in tree.root.children if c.kind == NodeKind.NOT_CLUSTERABLE]
    assert len(nc) == 1
    assert nc[0].items == ["u"]
    # the clusterable photos are under non-not_clusterable children
    clustered = [c for c in tree.root.children if c.kind != NodeKind.NOT_CLUSTERABLE]
    assert sorted(pid for c in clustered for pid in collect_items(c)) == ["a", "b"]


def test_run_clustering_is_deterministic(id_factory) -> None:
    pts = [make_point("a", minutes=0), make_point("b", minutes=1), make_point("c", minutes=300)]
    t1 = run_clustering(pts, "time_only", {}, id_factory)
    t2 = run_clustering(list(reversed(pts)), "time_only", {}, id_factory)
    assert shape(t1.root) == shape(t2.root)
    assert t1.input_fingerprint == t2.input_fingerprint


def test_run_clustering_unknown_method(id_factory) -> None:
    with pytest.raises(UnknownMethodError):
        run_clustering([make_point("a", minutes=0)], "space_time", {}, id_factory)
