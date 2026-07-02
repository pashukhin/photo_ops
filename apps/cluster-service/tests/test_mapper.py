from __future__ import annotations

import json
from datetime import datetime

from cluster.v1 import cluster_service_pb2 as pb

from cluster_service.mapper import (
    descriptor_to_proto,
    node_to_proto,
    result_to_proto,
    summary_to_proto,
)
from cluster_service.methods.base import MethodDescriptor
from cluster_service.model import NodeKind, TreeNode
from cluster_service.store import StoredResult, StoredSummary


def test_node_to_proto_recursive() -> None:
    leaf = TreeNode(id="l1", kind=NodeKind.LEAF, photo_count=1, cover_photo_id="p1", items=["p1"])
    root = TreeNode(
        id="r",
        kind=NodeKind.ROOT,
        merge_distance=1.5,
        date_from=datetime(2024, 6, 15, 12, 0, 0),
        photo_count=1,
        children=[leaf],
    )
    proto = node_to_proto(root)
    assert proto.kind == pb.CLUSTER_NODE_KIND_ROOT
    assert proto.date_from == "2024-06-15T12:00:00"
    assert len(proto.children) == 1
    child = proto.children[0]
    assert child.kind == pb.CLUSTER_NODE_KIND_LEAF
    assert [i.photo_id for i in child.items] == ["p1"]


def test_result_to_proto_pending_has_no_root() -> None:
    r = StoredResult(
        id="r1", user_id="u1", method="time_only", params_json="{}", scope="all", status="pending"
    )
    proto = result_to_proto(r)
    assert proto.status == pb.CLUSTERING_STATUS_PENDING
    assert not proto.HasField("root")


def test_summary_to_proto() -> None:
    s = StoredSummary(
        id="r1",
        method="time_only",
        status="ready",
        photo_count=3,
        date_from=datetime(2024, 6, 15, 12, 0, 0),
        date_to=datetime(2024, 6, 15, 13, 0, 0),
        created_at="2024-06-15T12:00:00Z",
    )
    proto = summary_to_proto(s)
    assert proto.status == pb.CLUSTERING_STATUS_READY
    assert proto.photo_count == 3
    assert proto.date_to == "2024-06-15T13:00:00"


def test_descriptor_to_proto() -> None:
    d = MethodDescriptor(
        id="time_only",
        display_name="Time",
        description="desc",
        required_photo_fields=("taken_at",),
        default_params={"linkage": "average"},
    )
    proto = descriptor_to_proto(d)
    assert proto.id == "time_only"
    assert list(proto.required_photo_fields) == ["taken_at"]
    assert json.loads(proto.default_params_json) == {"linkage": "average"}
