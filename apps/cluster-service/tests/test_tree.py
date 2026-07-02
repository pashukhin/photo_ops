from __future__ import annotations

from conftest import BASE, collect_items, make_point

from cluster_service.model import NodeKind
from cluster_service.tree import build_segment_tree, pick_cover, time_span


def test_pick_cover_earliest_then_id() -> None:
    pts = [make_point("z", minutes=10), make_point("a", minutes=0), make_point("m", minutes=0)]
    # earliest is minute 0; tie broken by photo_id → "a"
    assert pick_cover(pts) == "a"


def test_pick_cover_empty() -> None:
    assert pick_cover([]) is None


def test_time_span() -> None:
    pts = [make_point("a", minutes=0), make_point("b", minutes=30), make_point("c", minutes=5)]
    lo, hi = time_span(pts)
    from datetime import timedelta

    assert lo == BASE
    assert hi == BASE + timedelta(minutes=30)


def test_build_segment_tree_single_leaf(id_factory) -> None:
    tree = build_segment_tree([make_point("solo", minutes=0)], id_factory)
    assert tree.kind == NodeKind.LEAF
    assert tree.items == ["solo"]
    assert tree.photo_count == 1
    assert tree.cover_photo_id == "solo"


def test_build_segment_tree_groups_closer_in_time(id_factory) -> None:
    # a,b are ~1 min apart; c is 5 h away → a,b must merge below the top split.
    pts = [
        make_point("a", minutes=0),
        make_point("b", minutes=1),
        make_point("c", minutes=300),
    ]
    root = build_segment_tree(pts, id_factory)
    assert root.kind == NodeKind.INTERNAL
    # top split: one branch is {a,b}, the other is {c}
    branches = sorted((collect_items(ch) for ch in root.children), key=len, reverse=True)
    assert branches[0] == ["a", "b"]
    assert branches[1] == ["c"]


def test_build_segment_tree_membership_and_aggregates(id_factory) -> None:
    pts = [make_point("a", minutes=0), make_point("b", minutes=1)]
    root = build_segment_tree(pts, id_factory)
    # internal node: no direct items, aggregate count, positive merge height, cover set
    assert root.items == []
    assert root.photo_count == 2
    assert root.merge_distance > 0
    assert root.cover_photo_id == "a"
    # each photo enters at its own LEAF node
    leaves = root.children
    assert all(leaf.kind == NodeKind.LEAF and len(leaf.items) == 1 for leaf in leaves)
    assert collect_items(root) == ["a", "b"]
