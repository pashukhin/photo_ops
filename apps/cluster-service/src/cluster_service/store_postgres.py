"""Postgres (psycopg) implementation of the Store port (cluster-db).

Thin persistence adapter. GREEN (photo_ops-1ja): create_pending inserts a PENDING
row (ON CONFLICT DO NOTHING — idempotent by result_id); save_tree inserts the
cluster_nodes/cluster_items rows (pre-order, ordinal-stable) + fingerprint +
photo_count + consumption_json; mark_ready/mark_failed update status; get/
list_for_user reconstruct the tree/summaries. Smoke-verified; excluded from unit
coverage. Logic is covered against InMemoryStore.
"""
from __future__ import annotations

from .model import ClusterTree
from .store import StoredResult, StoredSummary


class PostgresStore:  # pragma: no cover - live DB IO adapter (smoke-verified)
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn

    def create_pending(
        self, *, result_id: str, user_id: str, method: str, params_json: str, scope: str
    ) -> None:
        raise NotImplementedError("PostgresStore.create_pending — GREEN pending (photo_ops-1ja)")

    def save_tree(self, *, result_id: str, tree: ClusterTree, consumption_json: str) -> None:
        raise NotImplementedError("PostgresStore.save_tree — GREEN pending (photo_ops-1ja)")

    def mark_ready(self, *, result_id: str) -> None:
        raise NotImplementedError("PostgresStore.mark_ready — GREEN pending (photo_ops-1ja)")

    def mark_failed(self, *, result_id: str, error_message: str) -> None:
        raise NotImplementedError("PostgresStore.mark_failed — GREEN pending (photo_ops-1ja)")

    def get(self, *, result_id: str, user_id: str) -> StoredResult | None:
        raise NotImplementedError("PostgresStore.get — GREEN pending (photo_ops-1ja)")

    def list_for_user(self, *, user_id: str) -> list[StoredSummary]:
        raise NotImplementedError("PostgresStore.list_for_user — GREEN pending (photo_ops-1ja)")
