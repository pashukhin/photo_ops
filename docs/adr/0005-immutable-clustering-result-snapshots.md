# ADR 0005 — Immutable read-only clustering result snapshots

Date: 2026-06-28 · Status: accepted · Session: 012 (`photo_ops-e9h`)

Context: companion to ADR 0004 (the clustering *approach*). This ADR records the
durable *why* for the clustering **result data model and its lifecycle**. The
entities are named here; their fields and schema live in the `cluster-db`
migration in the session-012 skeleton, and the behavior in its tests — not here.
Owned by `cluster-service` in `cluster-db`; cross-service references are UUID v7
with no cross-service foreign keys.

## Decisions

1. **A clustering run produces an immutable result snapshot.** The entities are
   `ClusteringResult` (the run), `ClusterNode` (a node in the result tree), and
   `ClusterItem` (a photo's membership in its node — the "photo reference",
   i.e. a leaf). A result is created for a given input set and never changes
   afterward; re-running creates a **new, coexisting** result and the old ones
   remain. This realizes the recommended **ADR-006 "clusters read-only in MVP"**
   as immutable snapshots. *Rejected:* mutable clusters / in-place recompute
   (the original §3.5 / ADR-006 "recompute replaces" — loses run history and the
   ability to compare runs; the owner explicitly wants prior results to persist).

2. **The result is a tree, not a flat list.** Nodes are clusters; leaves are
   photo references; a publication can be created from any non-deleted, non-empty
   node **at any level**. The owner wants hierarchical structure that converts
   organically into publications at multiple granularities (an episode, or a set
   of episodes). This **evolves** `docs/domain-model.md`'s flat
   `PhotoCluster`/`PhotoClusterItem` into this tree (the domain-model doc is
   updated during implementation). Membership is stored only at a photo's entry
   node; ancestor membership and counts are derived by walking the tree.
   *Rejected:* flat clusters (the current domain-model shape — insufficient for
   multi-level publications).

3. **Photos that cannot be placed go to a top-level `not_clusterable` node; the
   run never aborts for them.** A photo without a usable timestamp or without
   coordinates cannot enter the space-time space, so it is collected in a
   top-level node rather than dropped or failing the run. (Time-only clustering
   for no-GPS photos is a separate future space — ADR 0004 — not this.)

4. **Deletion is soft and recoverable, and is decoupled from photo originals.**
   Deleting a cluster or a result never deletes photo originals — only the
   references and cluster-owned derived objects; deleting an original does not
   delete the cluster (its items simply reference a gone object). Recoverability
   is a data-model decision (a soft-delete marker); the delete/restore
   **operations** are a seam this session (the marker exists, the endpoints come
   later).

5. **Determinism is over (input set + parameters):** identical input and
   parameters yield an identical tree structure and membership. Node and item ids
   are **per-run** (not reproducible across runs) — acceptable because results are
   independent snapshots — and an `input_fingerprint` records input identity.
   **Carry-over** of derived objects onto "identical" clusters across runs is an
   opt-in future seam that needs a cluster-equivalence definition;
   `input_fingerprint` is the hook. *Rejected:* cross-run-stable ids
   (unnecessary; results are snapshots, not a single evolving graph).

6. **Notes are out of `cluster-service`.** Notes (on clusters and on membership
   edges) are a separate specialized concern of currently-unknown necessity — a
   possible future `notes-service`, consistent with `docs/domain-model.md`
   ("Note: Owner: deferred"). `cluster-db` therefore gets **no** notes fields;
   the only obligation is that `ClusterNode.id` and `ClusterItem.id` are stable,
   addressable UUID v7 so a future notes-service can reference them via the
   universal `entity_type` + `entity_id` model (ТЗ §3.6) — no coupling, no FK.
   *Rejected:* notes tables in `cluster-db` (premature; couples an unproven
   feature into the clustering domain).

## Non-goals (negative space)

Soft-delete / restore endpoints; carry-over and the cluster-equivalence
definition; notes and a `notes-service`; query / explicit-set input scopes (this
session clusters all of the user's `ready` photos); manual split / merge / edit
of clusters (ТЗ excludes these in the MVP). The `cluster-db` schema and RED tests
are authored in the session-012 skeleton, not in this ADR.
