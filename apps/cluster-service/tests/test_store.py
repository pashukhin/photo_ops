from __future__ import annotations

from datetime import datetime

from cluster_service.model import ClusterTree, NodeKind, TreeNode
from cluster_service.store import InMemoryStore


def _pending(store: InMemoryStore, result_id: str = "r1", user_id: str = "u1") -> None:
    store.create_pending(
        result_id=result_id, user_id=user_id, method="time_only", params_json="{}", scope="all"
    )


def _tree(root_id: str = "root") -> ClusterTree:
    root = TreeNode(
        id=root_id,
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


def test_save_tree_keeps_pending_until_mark_ready() -> None:
    s = InMemoryStore()
    _pending(s)
    s.save_tree(result_id="r1", tree=_tree(), consumption_json='{"wall_seconds":1}')
    r = s.get(result_id="r1", user_id="u1")
    # tree persisted, but status stays pending until the result-consumer flips it
    assert r.status == "pending"
    assert r.input_fingerprint == "fp1"
    assert r.photo_count == 2
    assert r.root is not None
    assert r.consumption_json == '{"wall_seconds":1}'

    s.mark_ready(result_id="r1")
    assert s.get(result_id="r1", user_id="u1").status == "ready"


def test_failed_run_never_becomes_ready() -> None:
    s = InMemoryStore()
    _pending(s)
    s.mark_failed(result_id="r1", error_message="boom")
    s.mark_ready(result_id="r1")  # no-op after failure
    assert s.get(result_id="r1", user_id="u1").status == "failed"


def test_soft_delete_hides_from_get_and_list() -> None:
    # why: delete is a read-filter over deleted_at; the run must vanish from both readers
    s = InMemoryStore()
    _pending(s, result_id="r1", user_id="u1")
    assert s.soft_delete(result_id="r1", user_id="u1") is True
    assert s.get(result_id="r1", user_id="u1") is None
    assert [r.id for r in s.list_for_user(user_id="u1")] == []


def test_soft_delete_is_owner_scoped_and_idempotent() -> None:
    # why: a non-owner or a second delete must not succeed -> maps to NOT_FOUND, not 200
    s = InMemoryStore()
    _pending(s, result_id="r1", user_id="u1")
    assert s.soft_delete(result_id="r1", user_id="u2") is False  # non-owner
    assert s.soft_delete(result_id="r1", user_id="u1") is True  # owner
    assert s.soft_delete(result_id="r1", user_id="u1") is False  # already deleted
    assert s.soft_delete(result_id="missing", user_id="u1") is False


def test_finalized_result_is_immutable() -> None:
    s = InMemoryStore()
    _pending(s)
    s.save_tree(result_id="r1", tree=_tree(), consumption_json="{}")
    s.mark_ready(result_id="r1")
    # once ready, save_tree and mark_failed are no-ops (immutable snapshot)
    s.save_tree(result_id="r1", tree=_tree(), consumption_json="ignored")
    s.mark_failed(result_id="r1", error_message="ignored")
    r = s.get(result_id="r1", user_id="u1")
    assert r.status == "ready"
    assert r.consumption_json == "{}"
    assert r.error_message == ""


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
    s.save_tree(result_id="r1", tree=_tree(), consumption_json="{}")
    s.mark_ready(result_id="r1")
    (summary,) = s.list_for_user(user_id="u1")
    assert summary.status == "ready"
    assert summary.date_from == datetime(2024, 6, 15, 12, 0, 0)
    assert summary.photo_count == 2


def test_save_tree_is_idempotent_across_redelivery_with_a_distinct_tree() -> None:
    # why (42b): a redelivery-while-pending recomputes a DIFFERENT tree (fresh ids); the
    # second save must NOT overwrite/duplicate — the first tree wins. A DISTINCT second
    # tree is required — reusing the same one would be a vacuous pass.
    s = InMemoryStore()
    _pending(s)
    s.save_tree(result_id="r1", tree=_tree(root_id="root-A"), consumption_json="{}")
    s.save_tree(result_id="r1", tree=_tree(root_id="root-B"), consumption_json="{}")  # redelivery
    r = s.get(result_id="r1", user_id="u1")
    assert r is not None and r.root is not None
    assert r.root.id == "root-A"  # first tree wins; not overwritten by root-B


def test_save_tree_returns_false_for_missing_or_failed_result() -> None:
    # why (1m8): no live pending row to fill → False, so the worker skips SUCCEEDED.
    # Also pins the .get() fix (a missing row must not KeyError, m7).
    s = InMemoryStore()
    assert s.save_tree(result_id="ghost", tree=_tree(), consumption_json="{}") is False
    _pending(s)
    s.mark_failed(result_id="r1", error_message="boom")
    assert s.save_tree(result_id="r1", tree=_tree(), consumption_json="{}") is False
