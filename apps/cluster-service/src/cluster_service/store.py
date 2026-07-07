"""Persistence port + in-memory fake for the immutable clustering tree.

The real Postgres adapter (psycopg) is wired in the server/worker entrypoints
(GREEN, photo_ops-1ja) as a thin IO adapter; logic is exercised against
InMemoryStore here. Results are immutable once READY; re-clustering creates a new
row. create_pending is idempotent by result_id (charge-once on the result row).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from .model import ClusterTree, TreeNode


@dataclass
class StoredResult:
    id: str
    user_id: str
    method: str
    params_json: str
    scope: str
    status: str  # pending | ready | failed
    input_fingerprint: str | None = None
    error_message: str = ""
    photo_count: int = 0
    created_at: str = ""
    consumption_json: str = ""
    root: TreeNode | None = None


@dataclass
class StoredSummary:
    id: str
    method: str
    status: str
    photo_count: int
    date_from: datetime | None
    date_to: datetime | None
    created_at: str


class Store(Protocol):
    def create_pending(
        self, *, result_id: str, user_id: str, method: str, params_json: str, scope: str
    ) -> None: ...

    def save_tree(
        self, *, result_id: str, tree: ClusterTree, consumption_json: str
    ) -> bool: ...

    def mark_ready(self, *, result_id: str) -> None: ...

    def mark_failed(self, *, result_id: str, error_message: str) -> None: ...

    def get(self, *, result_id: str, user_id: str) -> StoredResult | None: ...

    def list_for_user(self, *, user_id: str) -> list[StoredSummary]: ...


class InMemoryStore:
    """Dict-backed Store for unit/component tests."""

    def __init__(self, now: str = "1970-01-01T00:00:00Z") -> None:
        self._now = now
        self._results: dict[str, StoredResult] = {}
        self._order: list[str] = []

    def create_pending(
        self, *, result_id: str, user_id: str, method: str, params_json: str, scope: str
    ) -> None:
        if result_id in self._results:  # idempotent by result_id
            return
        self._results[result_id] = StoredResult(
            id=result_id,
            user_id=user_id,
            method=method,
            params_json=params_json,
            scope=scope,
            status="pending",
            created_at=self._now,
        )
        self._order.append(result_id)

    def save_tree(self, *, result_id: str, tree: ClusterTree, consumption_json: str) -> bool:
        # Worker persists the computed tree; status stays PENDING until the
        # result-consumer flips it (mirrors photo-service finalizing on the result).
        # Returns whether the tree is persisted for a live result (drives the worker's
        # SUCCEEDED+usage). Idempotent: a redelivery re-persists nothing but still
        # reports applied so the flip is driven; a missing/failed run reports not-applied.
        r = self._results.get(result_id)
        if r is None or r.status == "failed":  # no live result to fill (1m8)
            return False
        if r.root is not None:  # tree already persisted — don't re-insert (42b)
            return True
        r.input_fingerprint = tree.input_fingerprint
        r.photo_count = tree.photo_count
        r.root = tree.root
        r.consumption_json = consumption_json
        return True

    def mark_ready(self, *, result_id: str) -> None:
        r = self._results[result_id]
        if r.status == "failed":  # a failed run never becomes ready
            return
        r.status = "ready"

    def mark_failed(self, *, result_id: str, error_message: str) -> None:
        r = self._results[result_id]
        if r.status == "ready":
            return
        r.status = "failed"
        r.error_message = error_message

    def get(self, *, result_id: str, user_id: str) -> StoredResult | None:
        r = self._results.get(result_id)
        if r is None or r.user_id != user_id:  # owner scope
            return None
        return r

    def list_for_user(self, *, user_id: str) -> list[StoredSummary]:
        out: list[StoredSummary] = []
        for rid in self._order:
            r = self._results[rid]
            if r.user_id != user_id:
                continue
            lo, hi = time_span_of_root(r.root)
            out.append(
                StoredSummary(
                    id=r.id,
                    method=r.method,
                    status=r.status,
                    photo_count=r.photo_count,
                    date_from=lo,
                    date_to=hi,
                    created_at=r.created_at,
                )
            )
        return out


def time_span_of_root(root: TreeNode | None) -> tuple[datetime | None, datetime | None]:
    """Root's date span (from its own aggregates, falling back to None)."""
    if root is None:
        return (None, None)
    return (root.date_from, root.date_to)
