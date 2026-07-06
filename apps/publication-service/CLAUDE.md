# publication-service

## Local context

- Owns the `Post` / `PostPhoto` domain and `publication-db`; exposes a gRPC API
  (port `PUBLICATION_SERVICE_GRPC_PORT`, default 50058) + an HTTP health route
  (`GET /health`, port 3012). Mirrors `photo-service` structure.
- `CreatePostFromCluster` (`src/post/post.service.ts` → `PostDomainService`) reads
  a clustering result from `cluster-service` via `ClusterReader`
  (`src/post/cluster.reader.ts`, `CLUSTER_SERVICE_GRPC_URL`), locates the node,
  snapshots its subtree photos in tree order into a new draft, and seeds
  `date_from`/`date_to` from the node. `location_label` is NOT seeded — the
  cluster carries no place (ADR-0005). status=`draft`, visibility=`private`.
- `PublicationGrpcController` (`src/post/post.grpc.controller.ts`) is the
  proto↔domain boundary: maps status/visibility strings ↔ proto enum numbers,
  `Date|null` ↔ ISO-string|"", and builds a `PostPatch` from present `UpdatePost`
  fields only. `userId` is always caller-supplied from the validated session in
  api-gateway.
- `PostRepository` (`src/post/post.repository.ts`) is the Drizzle/Postgres adapter
  (`posts` + `post_photos`); schema in `src/db/schema.ts`, migration in
  `migrations/`, applied via `make migrate-publication`.
- Tests: `vitest run` (`make test-publication` via the workspace). Typecheck:
  `tsc --noEmit`.

## Local invariants

- Owns and connects only to `publication-db`.
- A post snapshots the membership of a cluster node's subtree at creation; it does
  not track the live cluster (results are immutable — ADR-0005 — and the post is
  independently editable). `source_cluster_id` = node id; `source_result_id` = run.
- Posts/photos are scoped by authenticated `user_id`; cross-service references use
  UUID v7 with no cross-service FK.
- Public delivery (later) uses prepared photo variants, never originals.
- `UpdatePost` mutates `post_photos` **replace-all** (session 018): a present
  `photos` wrapper replaces the whole list (order = list position, canonicalized
  in the repository); the domain guards it to a non-empty, duplicate-free subset
  of the post's current membership (no add via replace-all — `'invalid photo
  membership'` → INVALID_ARGUMENT). An absent wrapper leaves photos untouched.
  `CreatePostFromCluster` rejects ROOT/NOT_CLUSTERABLE/empty nodes
  (`'node not selectable'` / `'empty node'` → INVALID_ARGUMENT).
- slug + `published_at` + Publish/Unpublish are session 019 (columns exist, empty
  here).
