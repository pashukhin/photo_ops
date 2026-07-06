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
- `PublishPost` / `UnpublishPost` / `GetPublicPostBySlug` (session 019,
  `PostDomainService`): publish is the atomic "publish as public|unlisted" —
  status=`published`, an opaque `crypto` slug + `published_at` minted **once** at
  first publish (immutable on republish); private/unspecified → `'cannot publish
  private'` (INVALID_ARGUMENT). `GetPublicPostBySlug` is the UNauthenticated read
  gate (no user_id): a post ONLY when published + public|unlisted, else NOT_FOUND
  (via `findBySlugPublic`). The returned `Post` carries the owner `user_id`
  internally so api-gateway can resolve variant urls.
- **Messaging** (session 019, `src/messaging/` + `src/post/usage.{codec,emitter}.ts`):
  on publish, emits a `post_published` `ConsumptionEvent` to the `usage.events`
  RabbitMQ stream (charge-once key `published:{postId}`). `LazyRabbitMqPublisher`
  connects **lazily on first emit** (bounded retry, NOT the broker-consumer's
  eager 15×2s) and is **non-throwing at boot** — the broker is a runtime dep, NOT
  a boot dep (a down broker must never take a post RPC offline). Emit is
  **fire-and-forget** after commit (best-effort side channel; a failure is logged,
  never rolls back publish). `RabbitMqBus` topology mirrors photo-service exactly
  (usage-service is the consumer).
- Tests: `vitest run` (`make test-publication` via the workspace). Typecheck:
  `tsc --noEmit`.

## Local invariants

- Owns and connects only to `publication-db`.
- A post snapshots the membership of a cluster node's subtree at creation; it does
  not track the live cluster (results are immutable — ADR-0005 — and the post is
  independently editable). `source_cluster_id` = node id; `source_result_id` = run.
- Posts/photos are scoped by authenticated `user_id`; cross-service references use
  UUID v7 with no cross-service FK.
- Public delivery uses prepared photo variants, never originals. The public read
  path is: web SSR → gateway `GET /v1/public/posts/:slug` (unauth) →
  `GetPublicPostBySlug` → gateway resolves variant urls owner-scoped via
  photo-service `GetVariantsByIds`. This service stays publication-status-blind;
  the slug gate is what authorizes public exposure.
- Owns and connects only to `publication-db` (the RabbitMQ publisher above is a
  message bus, not a database — the DB-ownership invariant is DB-scoped).
- `UpdatePost` mutates `post_photos` **replace-all** (session 018): a present
  `photos` wrapper replaces the whole list (order = list position, canonicalized
  in the repository); the domain guards it to a non-empty, duplicate-free subset
  of the post's current membership (no add via replace-all — `'invalid photo
  membership'` → INVALID_ARGUMENT). An absent wrapper leaves photos untouched.
  `CreatePostFromCluster` rejects ROOT/NOT_CLUSTERABLE/empty nodes
  (`'node not selectable'` / `'empty node'` → INVALID_ARGUMENT).
- `slug` is an opaque, unguessable token minted once at first publish and is
  immutable (this is what makes `unlisted` — reachable only by direct slug, not in
  listings — meaningful); `published_at` is likewise set once and immutable.
  Unpublish flips status only, leaving slug/published_at/visibility untouched.
