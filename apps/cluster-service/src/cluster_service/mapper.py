"""Map internal model → proto (the gRPC response surface).

One-way: internal StoredResult/TreeNode/MethodDescriptor → proto messages. Datetimes
render as ISO strings; internal node-kind / status strings map to proto enums.
"""
from __future__ import annotations

import json
from datetime import datetime

from cluster.v1 import cluster_service_pb2 as pb

from .methods.base import MethodDescriptor
from .model import NodeKind, TreeNode
from .store import StoredResult, StoredSummary

_KIND_TO_PROTO: dict[str, "pb.ClusterNodeKind.ValueType"] = {
    NodeKind.ROOT: pb.CLUSTER_NODE_KIND_ROOT,
    NodeKind.INTERNAL: pb.CLUSTER_NODE_KIND_INTERNAL,
    NodeKind.LEAF: pb.CLUSTER_NODE_KIND_LEAF,
    NodeKind.NOT_CLUSTERABLE: pb.CLUSTER_NODE_KIND_NOT_CLUSTERABLE,
    NodeKind.SEGMENT: pb.CLUSTER_NODE_KIND_SEGMENT,
}

_STATUS_TO_PROTO: dict[str, "pb.ClusteringStatus.ValueType"] = {
    "pending": pb.CLUSTERING_STATUS_PENDING,
    "ready": pb.CLUSTERING_STATUS_READY,
    "failed": pb.CLUSTERING_STATUS_FAILED,
}


def _iso(dt: datetime | None) -> str:
    return dt.isoformat() if dt is not None else ""


def node_to_proto(node: TreeNode) -> pb.ClusterNode:
    return pb.ClusterNode(
        id=node.id,
        kind=_KIND_TO_PROTO[node.kind],
        merge_distance=node.merge_distance,
        date_from=_iso(node.date_from),
        date_to=_iso(node.date_to),
        photo_count=node.photo_count,
        cover_photo_id=node.cover_photo_id or "",
        segment_label=node.segment_label,
        children=[node_to_proto(c) for c in node.children],
        items=[pb.ClusterItem(photo_id=pid) for pid in node.items],
    )


def result_to_proto(result: StoredResult) -> pb.ClusteringResult:
    return pb.ClusteringResult(
        id=result.id,
        user_id=result.user_id,
        method=result.method,
        params_json=result.params_json,
        input_fingerprint=result.input_fingerprint or "",
        status=_STATUS_TO_PROTO[result.status],
        error_message=result.error_message,
        created_at=result.created_at,
        root=node_to_proto(result.root) if result.root is not None else None,
    )


def summary_to_proto(summary: StoredSummary) -> pb.ClusteringResultSummary:
    return pb.ClusteringResultSummary(
        id=summary.id,
        method=summary.method,
        status=_STATUS_TO_PROTO[summary.status],
        photo_count=summary.photo_count,
        date_from=_iso(summary.date_from),
        date_to=_iso(summary.date_to),
        created_at=summary.created_at,
    )


def descriptor_to_proto(d: MethodDescriptor) -> pb.ClusteringMethodDescriptor:
    return pb.ClusteringMethodDescriptor(
        id=d.id,
        display_name=d.display_name,
        description=d.description,
        required_photo_fields=list(d.required_photo_fields),
        default_params_json=json.dumps(d.default_params, sort_keys=True),
    )
