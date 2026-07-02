"""Internal domain model for clustering compute (transport-agnostic).

These dataclasses are the boundary between the proto/codec layer and the compute
core: the codec turns a `ListPhotoSpacetime` response into `PhotoPoint`s, the
core builds a `ClusterTree`, and the store/codec turns it back into proto/rows.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


class NodeKind:
    """Values for `TreeNode.kind` (mirrors the proto ClusterNodeKind)."""

    ROOT = "root"
    INTERNAL = "internal"
    LEAF = "leaf"
    NOT_CLUSTERABLE = "not_clusterable"
    SEGMENT = "segment"


@dataclass(frozen=True)
class PhotoPoint:
    """One photo's clustering-relevant attributes.

    `taken_at` is the already-resolved capture instant (utc preferred, else the
    local wall-clock); `None` means the photo has no usable time. `lat`/`lon` are
    carried for the future space-time method and are `None` when absent.
    """

    photo_id: str
    taken_at: datetime | None
    lat: float | None = None
    lon: float | None = None
    camera_make: str = ""
    camera_model: str = ""


@dataclass
class TreeNode:
    """One node of a cluster tree. Leaves carry `items` (the photos entering at
    that node); internal/segment/root nodes carry `children`. Aggregates
    (`photo_count`, date span, cover) are filled over the subtree."""

    id: str
    kind: str
    merge_distance: float = 0.0
    date_from: datetime | None = None
    date_to: datetime | None = None
    photo_count: int = 0
    cover_photo_id: str | None = None
    segment_label: str = ""
    children: list["TreeNode"] = field(default_factory=list)
    items: list[str] = field(default_factory=list)


@dataclass
class ClusterTree:
    """A full clustering result: the root node plus the determinism anchor."""

    root: TreeNode
    input_fingerprint: str
    photo_count: int
