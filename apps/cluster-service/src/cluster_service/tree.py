"""Dendrogram → tree mapping and per-subtree aggregates.

`PhotoPoint.taken_at` is a naive datetime: the codec flattens tz to a single
comparable form (mixed-tz is an approximation — a documented seam, ТЗ §13), so
ordering and spans here never compare aware-vs-naive datetimes.
"""
from __future__ import annotations

from collections.abc import Callable, Sequence
from datetime import datetime

from .model import PhotoPoint, TreeNode


def pick_cover(points: Sequence[PhotoPoint]) -> str | None:
    """Deterministic cover photo for a set: earliest capture, then photo_id.
    Points without a capture time sort last (by photo_id)."""
    if not points:
        return None
    chosen = min(points, key=lambda p: (p.taken_at is None, p.taken_at or datetime.min, p.photo_id))
    return chosen.photo_id


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

    Contract (GREEN — photo_ops-9dk):
    - 1 point  → a single LEAF node carrying that photo as its only item.
    - N points → scipy average-linkage over the 1-D time values yields a binary
      dendrogram; each merge becomes an INTERNAL node with merge_distance = the
      merge height; each original point becomes a LEAF carrying its photo as an
      item at that (entry) node. Aggregates (photo_count, date span, cover) are
      filled bottom-up. Closer-in-time photos share a nearer common ancestor.
    """
    raise NotImplementedError("build_segment_tree — GREEN pending (photo_ops-9dk)")
