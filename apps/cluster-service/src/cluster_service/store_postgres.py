"""Postgres (psycopg) implementation of the Store port (cluster-db).

Thin persistence adapter. Smoke-verified; excluded from unit coverage (logic is
covered against InMemoryStore). Results are immutable once READY; create_pending
is idempotent by result_id.
"""
from __future__ import annotations

import psycopg
from psycopg.rows import dict_row

from .model import ClusterTree, TreeNode
from .store import StoredResult, StoredSummary


class PostgresStore:  # pragma: no cover - live DB IO adapter (smoke-verified)
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn

    def create_pending(
        self, *, result_id: str, user_id: str, method: str, params_json: str, scope: str
    ) -> None:
        with psycopg.connect(self._dsn) as conn:
            conn.execute(
                "INSERT INTO clustering_results (id, user_id, method, params_json, scope, status) "
                "VALUES (%s, %s, %s, %s::jsonb, %s, 'pending') ON CONFLICT (id) DO NOTHING",
                (result_id, user_id, method, params_json or "{}", scope),
            )

    def save_tree(self, *, result_id: str, tree: ClusterTree, consumption_json: str) -> bool:
        # Returns whether the tree is persisted for a live result (drives the worker's
        # SUCCEEDED+usage, 1m8). Idempotent by node existence: a redelivery-while-pending
        # must not insert a second root (42b). The node-existence check runs inside the
        # FOR UPDATE lock — the lock alone does not serialise sequential redeliveries
        # because save_tree never flips status (the server's result-consumer does).
        with psycopg.connect(self._dsn) as conn:
            row = conn.execute(
                "SELECT status FROM clustering_results WHERE id = %s FOR UPDATE", (result_id,)
            ).fetchone()
            if row is None or row[0] == "failed":  # no live result to fill (1m8)
                return False
            existing = conn.execute(
                "SELECT 1 FROM cluster_nodes WHERE result_id = %s LIMIT 1", (result_id,)
            ).fetchone()
            if existing is not None:  # tree already persisted — don't re-insert (42b)
                return True
            conn.execute(
                "UPDATE clustering_results SET input_fingerprint = %s, photo_count = %s, "
                "consumption_json = %s::jsonb WHERE id = %s",
                (tree.input_fingerprint, tree.photo_count, consumption_json or "{}", result_id),
            )
            self._insert_node(conn, result_id, None, tree.root, 0)
            return True

    def _insert_node(
        self,
        conn: "psycopg.Connection",
        result_id: str,
        parent_id: str | None,
        node: TreeNode,
        ordinal: int,
    ) -> None:
        conn.execute(
            "INSERT INTO cluster_nodes (id, result_id, parent_id, kind, merge_distance, "
            "date_from, date_to, photo_count, cover_photo_id, segment_label, ordinal) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (
                node.id,
                result_id,
                parent_id,
                node.kind,
                node.merge_distance,
                node.date_from,
                node.date_to,
                node.photo_count,
                node.cover_photo_id or None,
                node.segment_label or None,
                ordinal,
            ),
        )
        for i, photo_id in enumerate(node.items):
            conn.execute(
                "INSERT INTO cluster_items (node_id, photo_id, ordinal) VALUES (%s, %s, %s)",
                (node.id, photo_id, i),
            )
        for i, child in enumerate(node.children):
            self._insert_node(conn, result_id, node.id, child, i)

    def mark_ready(self, *, result_id: str) -> None:
        with psycopg.connect(self._dsn) as conn:
            conn.execute(
                "UPDATE clustering_results SET status = 'ready' "
                "WHERE id = %s AND status <> 'failed'",
                (result_id,),
            )

    def mark_failed(self, *, result_id: str, error_message: str) -> None:
        with psycopg.connect(self._dsn) as conn:
            conn.execute(
                "UPDATE clustering_results SET status = 'failed', error_message = %s "
                "WHERE id = %s AND status <> 'ready'",
                (error_message, result_id),
            )

    def soft_delete(self, *, result_id: str, user_id: str) -> bool:  # pragma: no cover
        with psycopg.connect(self._dsn) as conn:
            row = conn.execute(
                "UPDATE clustering_results SET deleted_at = now() "
                "WHERE id = %s AND user_id = %s AND deleted_at IS NULL RETURNING id",
                (result_id, user_id),
            ).fetchone()
            return row is not None

    def get(self, *, result_id: str, user_id: str) -> StoredResult | None:
        with psycopg.connect(self._dsn, row_factory=dict_row) as conn:
            r = conn.execute(
                "SELECT * FROM clustering_results "
                "WHERE id = %s AND user_id = %s AND deleted_at IS NULL",
                (result_id, user_id),
            ).fetchone()
            if r is None:
                return None
            nodes = conn.execute(
                "SELECT * FROM cluster_nodes WHERE result_id = %s "
                "ORDER BY parent_id NULLS FIRST, ordinal",
                (result_id,),
            ).fetchall()
            items = conn.execute(
                "SELECT ci.node_id, ci.photo_id FROM cluster_items ci "
                "JOIN cluster_nodes n ON n.id = ci.node_id "
                "WHERE n.result_id = %s ORDER BY ci.ordinal",
                (result_id,),
            ).fetchall()
            return StoredResult(
                id=str(r["id"]),
                user_id=str(r["user_id"]),
                method=r["method"],
                params_json=_as_json_str(r["params_json"]),
                scope=r["scope"],
                status=r["status"],
                input_fingerprint=r["input_fingerprint"],
                error_message=r["error_message"] or "",
                photo_count=r["photo_count"],
                created_at=r["created_at"].isoformat() if r["created_at"] else "",
                root=_build_tree(nodes, items),
            )

    def list_for_user(self, *, user_id: str) -> list[StoredSummary]:
        with psycopg.connect(self._dsn, row_factory=dict_row) as conn:
            rows = conn.execute(
                "SELECT r.id, r.method, r.status, r.photo_count, r.created_at, "
                "root.date_from AS date_from, root.date_to AS date_to "
                "FROM clustering_results r "
                "LEFT JOIN cluster_nodes root ON root.result_id = r.id AND root.parent_id IS NULL "
                "WHERE r.user_id = %s AND r.deleted_at IS NULL ORDER BY r.created_at DESC",
                (user_id,),
            ).fetchall()
            return [
                StoredSummary(
                    id=str(row["id"]),
                    method=row["method"],
                    status=row["status"],
                    photo_count=row["photo_count"],
                    date_from=row["date_from"],
                    date_to=row["date_to"],
                    created_at=row["created_at"].isoformat() if row["created_at"] else "",
                )
                for row in rows
            ]


def _as_json_str(value: object) -> str:
    import json

    return value if isinstance(value, str) else json.dumps(value)


def _build_tree(nodes: list[dict], items: list[dict]) -> TreeNode | None:
    if not nodes:
        return None
    items_by_node: dict[str, list[str]] = {}
    for it in items:
        items_by_node.setdefault(str(it["node_id"]), []).append(str(it["photo_id"]))

    built: dict[str, TreeNode] = {}
    children_of: dict[str | None, list[str]] = {}
    root_id: str | None = None
    for n in nodes:
        nid = str(n["id"])
        built[nid] = TreeNode(
            id=nid,
            kind=n["kind"],
            merge_distance=float(n["merge_distance"]),
            date_from=n["date_from"],
            date_to=n["date_to"],
            photo_count=n["photo_count"],
            cover_photo_id=str(n["cover_photo_id"]) if n["cover_photo_id"] else None,
            segment_label=n["segment_label"] or "",
            items=items_by_node.get(nid, []),
        )
        pid = str(n["parent_id"]) if n["parent_id"] else None
        children_of.setdefault(pid, []).append(nid)
        if pid is None:
            root_id = nid

    for parent_id, child_ids in children_of.items():
        if parent_id is None:
            continue
        built[parent_id].children = [built[c] for c in child_ids]

    return built[root_id] if root_id is not None else None
