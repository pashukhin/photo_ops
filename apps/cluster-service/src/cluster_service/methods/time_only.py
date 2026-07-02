"""time_only method: 1-D agglomerative clustering over capture time, hard-
partitioned by capture device.

Device segmentation is the anti-injection guard: a photo synced in from another
device (e.g. a WhatsApp dump) lands in its own segment instead of polluting a
real shooting episode. Within a device segment, photos are clustered by time
(the full dendrogram is kept — no threshold cut; reducing to a shallow view is
"segmentation", deferred).
"""
from __future__ import annotations

from collections.abc import Callable, Sequence

from ..model import NodeKind, PhotoPoint, TreeNode
from ..tree import build_segment_tree
from .base import ClusteringMethod, MethodDescriptor, register

UNKNOWN_DEVICE_LABEL = "Unknown device"


def device_label(make: str, model: str) -> str:
    """Human label + grouping key for a capture device. Empty make AND model
    (unknown device) collapse to a single UNKNOWN_DEVICE_LABEL segment."""
    label = f"{make} {model}".strip()
    return label if label else UNKNOWN_DEVICE_LABEL


class TimeOnlyMethod(ClusteringMethod):
    @property
    def descriptor(self) -> MethodDescriptor:
        return MethodDescriptor(
            id="time_only",
            display_name="Time (device-segmented)",
            description=(
                "1-D agglomerative clustering over capture time, hard-partitioned "
                "by capture device as an anti-injection guard."
            ),
            required_photo_fields=("taken_at",),
            default_params={"linkage": "average"},
        )

    def cluster(
        self,
        points: Sequence[PhotoPoint],
        params: dict,
        id_factory: Callable[[], str],
    ) -> list[TreeNode]:
        # Hard-partition by capture device (anti-injection), then time-cluster
        # within each device. Segments are ordered by earliest capture then label
        # for determinism.
        groups: dict[str, list[PhotoPoint]] = {}
        for p in points:
            groups.setdefault(device_label(p.camera_make, p.camera_model), []).append(p)

        segments: list[TreeNode] = []
        for label, pts in sorted(groups.items(), key=lambda kv: (min(_stamps(kv[1])), kv[0])):
            ordered = sorted(pts, key=lambda p: (p.taken_at, p.photo_id))
            subtree = build_segment_tree(ordered, id_factory)
            segments.append(
                TreeNode(
                    id=id_factory(),
                    kind=NodeKind.SEGMENT,
                    segment_label=label,
                    date_from=subtree.date_from,
                    date_to=subtree.date_to,
                    photo_count=subtree.photo_count,
                    cover_photo_id=subtree.cover_photo_id,
                    children=[subtree],
                )
            )
        return segments


def _stamps(points: list[PhotoPoint]) -> list:
    # time_only requires taken_at, so every point here has one.
    return [p.taken_at for p in points]


register(TimeOnlyMethod())
