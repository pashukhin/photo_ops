from __future__ import annotations

from datetime import datetime

from cluster_service.model import ClusterTree, NodeKind, TreeNode
from cluster_service.store import InMemoryStore


def _pending(store: InMemoryStore, result_id: str = "r1", user_id: str = "u1") -> None:
    store.create_pending(
        result_id=result_id, user_id=user_id, method="time_only", params_json="{}", scope="all"
    )


def _tree() -> ClusterTree:
    root = TreeNode(
        id="root",
        kind=NodeKind.ROOT,
        date_from=datetime(2024, 6, 15, 12, 0, 0),
        date_to=datetime(2024, 6, 15, 13, 0, 0),
        photo_count=2,
    )
    return ClusterTree(root=root, input_fingerprint="fp1", photo_count=2)


def test_create_pending_is_idempotent() -> None:
    s = InMemoryStore()
    _pending(s)
    _pending(s)
    assert len(s.list_for_user(user_id="u1")) == 1
    assert s.get(result_id="r1", user_id="u1").status == "pending"


def test_save_success_finalizes() -> None:
    s = InMemoryStore()
    _pending(s)
    s.save_success(result_id="r1", tree=_tree(), consumption_json="{}")
    r = s.get(result_id="r1", user_id="u1")
    assert r.status == "ready"
    assert r.input_fingerprint == "fp1"
    assert r.photo_count == 2
    assert r.root is not None


def test_mark_failed() -> None:
    s = InMemoryStore()
    _pending(s)
    s.mark_failed(result_id="r1", error_message="boom")
    r = s.get(result_id="r1", user_id="u1")
    assert r.status == "failed"
    assert r.error_message == "boom"


def test_get_is_owner_scoped() -> None:
    s = InMemoryStore()
    _pending(s)
    assert s.get(result_id="r1", user_id="other") is None
    assert s.list_for_user(user_id="other") == []


def test_list_reports_span_after_ready() -> None:
    s = InMemoryStore()
    _pending(s)
    s.save_success(result_id="r1", tree=_tree(), consumption_json="{}")
    (summary,) = s.list_for_user(user_id="u1")
    assert summary.status == "ready"
    assert summary.date_from == datetime(2024, 6, 15, 12, 0, 0)
    assert summary.photo_count == 2
