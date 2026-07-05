# ADR 0006 — Publication: snapshot a cluster node into an editable post

Date: 2026-07-05 · Status: accepted · Session: 017 (`photo_ops-m71.1`)

Context: session 017 turns `publication-service` from a 501 stub into a real
NestJS gRPC service owning `publication-db`, so a user can create a draft `Post`
from a cluster. This ADR records only the durable *why* and the rejected
alternatives — the contract lives in `proto/publication/v1/publication_service.proto`,
the schema in `apps/publication-service/migrations/0001_*` + `src/db/schema.ts`,
the behaviour in the TS test files, and the acceptance path in
`scripts/smoke-publication.sh`. Design: `docs/superpowers/specs/2026-07-05-publication-foundation-design.md`.
Method: exSDD / skeleton-first (`docs/agent-workflow-evolution.md` Decision 1).

## Decisions

1. **A post's source is a cluster NODE, and its photo membership is snapshotted,
   not referenced.** `CreatePostFromCluster(result_id, node_id)` copies the node
   subtree's photos (tree order, items-then-children pre-order) into `post_photos`
   rows at creation. `source_cluster_id` = the node id; a companion
   `source_result_id` records the run (the re-fetch key, since
   `GetClusteringResult` is keyed by result id — a node id alone can't be
   re-fetched). *Why:* clustering results are immutable (ADR-0005) and the editor
   (session 018) mutates a post's membership, order, and captions — so the post
   needs an independent, mutable copy. *Rejected:* a live reference to the
   node/result (the post would either be un-editable or would have to fight the
   immutability guarantee); snapshotting the whole result (publishing the entire
   library is not an episode — granularity is the node).

2. **`publication-service` reads `cluster-service` itself** (owns a
   `ClusterReader` proto-loader client), rather than the gateway flattening the
   tree and passing a photo-id list. *Why:* keeps `api-gateway` a thin mapper (its
   established shape — no domain logic), puts the seeding/traversal logic in the
   domain service where it is unit-tested, and mirrors the existing
   `cluster-service → photo-service` read pattern. The coupling is needed now, not
   premature. *Rejected:* gateway-side flattening (leaks domain logic — tree
   traversal, date seeding — into the HTTP edge; the RED tests for seeding would
   have nowhere natural to live).

3. **`location_label` is NOT seeded from the cluster.** A `ClusterNode` carries no
   place (ADR-0005 decision 9 — reverse-geocoding is outside clustering); only
   `date_from`/`date_to` are seeded. `location_label` starts empty and is filled
   in the editor / by future geocoding. This corrects the session brief's
   "seed location_label from the cluster", which was not achievable.

4. **Owner scope, no cross-service FK.** `user_id` is caller-supplied from the
   validated session in `api-gateway`; every read/update is scoped by it (a
   missing/other-user row → NOT_FOUND → HTTP 404). Cross-service refs
   (`user_id`, `photo_id`, `source_cluster_id`, `source_result_id`) are UUID v7
   with no cross-service foreign key.

## Non-goals (seams)

slug generation + `PublishPost`/`UnpublishPost` + `published_at` + the usage
`post_published` event (session 019 — the columns/fields exist but stay empty);
`post_photos` mutation — reorder / caption / add / remove (editor, session 018);
public `/posts/[slug]` page, map rendering, share/copy-link (019 / 020);
public delivery via prepared photo variants (later — never originals); an
in-process DB test (deferred `photo_ops-4vg` — the DB + cluster-read paths are
covered by the live `make smoke-publication`).
