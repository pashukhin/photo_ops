"""Dendrogram → tree mapping and per-subtree aggregates.

`PhotoPoint.taken_at` is a naive datetime: the codec flattens tz to a single
comparable form (mixed-tz is an approximation — a documented seam, ТЗ §13), so
ordering and spans here never compare aware-vs-naive datetimes.
"""
from __future__ import annotations

from collections.abc import Callable, Sequence
from datetime import datetime, timezone

from .model import NodeKind, PhotoPoint, TreeNode


def pick_cover(points: Sequence[PhotoPoint]) -> str | None:
    """Deterministic cover photo for a set: earliest capture, then photo_id.
    Points without a capture time sort last (by photo_id)."""
    if not points:
        return None
    chosen = min(points, key=lambda p: (p.taken_at is None, p.taken_at or datetime.min, p.photo_id))
    return chosen.photo_id


def count_nodes(node: TreeNode) -> int:
    """Total nodes in the subtree rooted at `node` (the domain 'clusters generated' counter)."""
    return 1 + sum(count_nodes(c) for c in node.children)


def time_span(points: Sequence[PhotoPoint]) -> tuple[datetime | None, datetime | None]:
    """(earliest, latest) capture instant over points, ignoring those without a
    time. (None, None) when no point has a time."""
    stamps = [p.taken_at for p in points if p.taken_at is not None]
    if not stamps:
        return (None, None)
    return (min(stamps), max(stamps))


def build_segment_tree(
    points: Sequence[PhotoPoint],
    id_factory: Callable[[], str],
) -> TreeNode:
    """Cluster one device segment's points by capture time into a dendrogram tree.

    - 1 point  → a single LEAF node carrying that photo as its only item.
    - N points → scipy average-linkage over the 1-D time values yields a binary
      dendrogram; each merge becomes an INTERNAL node with merge_distance = the
      merge height; each original point becomes a LEAF carrying its photo as an
      item at that (entry) node. Aggregates (photo_count, date span, cover) are
      filled bottom-up. Closer-in-time photos share a nearer common ancestor.
    """
    pts = list(points)
    if len(pts) == 1:
        return _leaf(pts[0], id_factory)

    import numpy as np
    from scipy.cluster.hierarchy import linkage, to_tree

    # 1-D feature = capture time in seconds; euclidean distance = |Δt|. taken_at is
    # naive (codec-flattened); treat it as UTC so .timestamp() is host-TZ/DST-independent.
    seconds = np.array(
        [[p.taken_at.replace(tzinfo=timezone.utc).timestamp()] for p in pts]  # type: ignore[union-attr]
    )
    sci_root = to_tree(linkage(seconds, method="average", metric="euclidean"))

    def build(node: "object") -> TreeNode:
        if node.is_leaf():  # type: ignore[attr-defined]
            return _leaf(pts[node.id], id_factory)  # type: ignore[attr-defined]
        children = [build(node.get_left()), build(node.get_right())]  # type: ignore[attr-defined]
        # Children come from leaves (each has a capture time + cover), so these
        # aggregates are always populated.
        froms = [c.date_from for c in children if c.date_from is not None]
        tos = [c.date_to for c in children if c.date_to is not None]
        best = min(children, key=lambda c: (c.date_from or datetime.min, c.cover_photo_id or ""))
        return TreeNode(
            id=id_factory(),
            kind=NodeKind.INTERNAL,
            merge_distance=float(node.dist),  # type: ignore[attr-defined]
            date_from=min(froms) if froms else None,
            date_to=max(tos) if tos else None,
            photo_count=sum(c.photo_count for c in children),
            cover_photo_id=best.cover_photo_id,
            children=children,
        )

    return build(sci_root)


def _leaf(point: PhotoPoint, id_factory: Callable[[], str]) -> TreeNode:
    return TreeNode(
        id=id_factory(),
        kind=NodeKind.LEAF,
        merge_distance=0.0,
        date_from=point.taken_at,
        date_to=point.taken_at,
        photo_count=1,
        cover_photo_id=point.photo_id,
        items=[point.photo_id],
    )
