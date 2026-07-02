from __future__ import annotations

import pytest
from conftest import collect_items, make_point

from cluster_service.errors import UnknownMethodError
from cluster_service.methods import all_methods, get
from cluster_service.methods.time_only import UNKNOWN_DEVICE_LABEL, device_label
from cluster_service.model import NodeKind


def test_registry_lists_time_only_only() -> None:
    ids = [m.descriptor.id for m in all_methods()]
    assert ids == ["time_only"]  # space_time is a seam, not registered in this slice


def test_get_time_only() -> None:
    m = get("time_only")
    d = m.descriptor
    assert d.id == "time_only"
    assert d.required_photo_fields == ("taken_at",)
    assert d.display_name  # non-empty label


def test_get_unknown_method_raises() -> None:
    with pytest.raises(UnknownMethodError) as exc:
        get("space_time")
    assert exc.value.method_id == "space_time"


def test_device_label() -> None:
    assert device_label("Canon", "EOS R5") == "Canon EOS R5"
    assert device_label("Canon", "") == "Canon"
    assert device_label("", "") == UNKNOWN_DEVICE_LABEL


def test_time_only_segments_by_device(id_factory) -> None:
    # Episode from the Canon; an injected photo from a phone timestamped INSIDE
    # the Canon window. Device segmentation must keep them in separate segments.
    points = [
        make_point("a", minutes=0, make="Canon", model="EOS R5"),
        make_point("inject", minutes=1, make="Samsung", model="SM-G991B"),
        make_point("b", minutes=2, make="Canon", model="EOS R5"),
    ]
    nodes = get("time_only").cluster(points, {}, id_factory)

    assert all(n.kind == NodeKind.SEGMENT for n in nodes)
    by_label = {n.segment_label: collect_items(n) for n in nodes}
    assert by_label == {
        "Canon EOS R5": ["a", "b"],
        "Samsung SM-G991B": ["inject"],
    }
