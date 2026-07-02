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
        # Group by device (stable), build a per-device SEGMENT node whose child is
        # the device's time dendrogram, ordered by earliest capture then label.
        raise NotImplementedError(
            "time_only.cluster — GREEN pending (photo_ops-9dk): group by "
            f"{device_label!r}, build {NodeKind.SEGMENT} nodes over "
            f"{build_segment_tree!r}"
        )


register(TimeOnlyMethod())
