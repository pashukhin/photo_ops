# Publication foundation — Post model + service + draft-from-cluster (session 017)

Date: 2026-07-05 · Method: exSDD (skeleton-first) · Epic `photo_ops-m71`, child
`photo_ops-m71.1` (DoD step 9). Session brief: `sessions/017_publication_foundation.md`.

This spec records the durable decisions and the reviewable shape of the change.
It does not restate proto/schema/test bodies (Principle 7 — each fact in the
cheapest artifact that fails when it drifts); those land in the skeleton commit.

## Goal

Turn `publication-service` from a 501 health-only stub into a real NestJS gRPC
service owning `publication-db`, so a user can create a **draft post from a
cluster**. Foundation for the editor (018) and publish/public-page (019).

## Settled forks (brainstorm)

1. **Source = a cluster NODE; membership is snapshotted.** A post's source is a
   node (subtree) of a clustering result, not the whole result. At creation the
   node's subtree photos are **copied** into `post_photos` (a snapshot).
   *Why:* clustering results are immutable (ADR-0005) and the editor (018) mutates
   post membership/order/captions, so the post needs an independent mutable copy.
   `source_cluster_id` = node id; a companion `source_result_id` records the run.
2. **`publication-service` reads `cluster-service` itself.** Given
   `(result_id, node_id, user_id)` the service calls `GetClusteringResult`,
   traverses the subtree, and seeds the post. *Why:* keeps `api-gateway` a thin
   mapper (its current shape — no domain logic), puts the testable seeding/traversal
   in the domain service where the RED tests live, and mirrors the established
   `cluster-service → photo-service` read pattern. Cost: one new cross-service
   client; the create smoke needs a real `ready` cluster.
3. **slug + Publish/Unpublish are deferred to 019.** The `slug` column and
   `published_at` exist but stay empty in 017; no `PublishPost`/`UnpublishPost`
   RPC; no slug-determinism test here. (This narrows the `bd photo_ops-m71.1`
   description, which listed them — the issue text is updated to match.)

## Key discovery

`location_label` **cannot** be seeded from the cluster: `ClusterNode` (proto +
ADR-0005 decision 9) carries no place — only `date_from`/`date_to`,
`segment_label` (device), `cover_photo_id`. Reverse-geocoding is deliberately
outside clustering. So `CreatePostFromCluster` seeds `date_from`/`date_to` only;
`location_label` starts empty (filled in the editor / by future geocoding).
The brief's "seed location_label from the cluster" is dropped.

## Contract — `proto/publication/v1/publication_service.proto`

Replaces the naive stub (`CreateDraftFromCluster(cluster_id) → post_id`). Closed
sets use enums (as in cluster/photo); the gateway maps enums → strings.

RPCs:

| RPC | HTTP annotation |
| --- | --- |
| `Health` | `GET /v1/publication/health` |
| `CreatePostFromCluster(req) → Post` | `POST /v1/posts` (body `*`) |
| `GetPost(GetPostRequest) → Post` | `GET /v1/posts/{post_id}` |
| `ListPosts(ListPostsRequest) → ListPostsResponse` | `GET /v1/posts` |
| `UpdatePost(UpdatePostRequest) → Post` | `PATCH /v1/posts/{post_id}` (body `*`) |

Messages:

- `CreatePostFromClusterRequest { user_id, result_id, node_id, title }` —
  `title` optional (`""` → default).
- `Post { id, user_id, source_cluster_id (=node_id), source_result_id, title,
  body, PostStatus status, PostVisibility visibility, slug, location_label,
  date_from, date_to, map_enabled, published_at, created_at, updated_at,
  repeated PostPhoto photos }`.
- `PostPhoto { photo_id, order, caption }`.
- `ListPostsRequest { user_id }` → `ListPostsResponse { repeated PostSummary }`
  (summary omits photos/body — mirrors `ClusteringResultSummary`).
- `UpdatePostRequest { post_id, user_id, optional title, optional body,
  optional visibility, optional location_label, optional map_enabled,
  optional date_from, optional date_to }` (post_photos mutation → 018).
- `PostStatus { UNSPECIFIED, DRAFT, PUBLISHED, UNPUBLISHED }`;
  `PostVisibility { UNSPECIFIED, PRIVATE, UNLISTED, PUBLIC }`.
- `slug`/`published_at` present but always empty in 017.

`user_id` is always caller-supplied from the validated session in `api-gateway`
(no auth in the service; owner-scope only). No cross-service FK; UUID v7.

## Storage — `publication-db` (owned solely by `publication-service`)

`publication_db` / `publication_user` already exist (postgres init). Migration
`apps/publication-service/migrations/0001_*.sql`; Drizzle mirror in
`src/db/schema.ts` (mirror `photo-service`, applied via `make migrate-publication`).

**posts**: `id uuid PK`, `user_id uuid NOT NULL`, `source_cluster_id uuid NOT NULL`
(node), `source_result_id uuid NOT NULL` (run / re-fetch key), `title text NOT NULL
DEFAULT ''`, `body text NOT NULL DEFAULT ''`, `status text NOT NULL CHECK (status IN
('draft','published','unpublished')) DEFAULT 'draft'`, `visibility text NOT NULL
CHECK (visibility IN ('private','unlisted','public')) DEFAULT 'private'`, `slug text
NULL`, `location_label text NOT NULL DEFAULT ''`, `date_from timestamptz NULL`,
`date_to timestamptz NULL`, `map_enabled boolean NOT NULL DEFAULT false`,
`published_at timestamptz NULL`, `created_at/updated_at timestamptz NOT NULL DEFAULT
now()`. Index `(user_id, created_at DESC)`. Partial-unique on `slug` → 019.

**post_photos**: `post_id uuid NOT NULL`, `photo_id uuid NOT NULL`, `"order" int
NOT NULL`, `caption text NOT NULL DEFAULT ''`, PK `(post_id, photo_id)` (a photo
appears once per post), index `(post_id, "order")`.

> `source_result_id` extends the domain-model (which lists only `source_cluster_id`)
> because `GetClusteringResult` is keyed by `result_id` — a node id alone cannot be
> re-fetched. `docs/domain-model.md` is updated to record it.

## Service structure (mirror `photo-service`)

NestJS gRPC microservice on `PUBLICATION_SERVICE_GRPC_PORT=50058`, owns
`publication-db`. Layers: `PublicationGrpcController` (proto↔domain boundary —
enum/default mapping) → `PostDomainService` → `PostRepository` (Drizzle). A
`ClusterClient` (copy of the gateway's proto-loader client) reads
`cluster-service` via `CLUSTER_SERVICE_GRPC_URL`. gRPC `Health` (as
`photo-service`). No message broker in 017 (the usage `post_published` event is a
019 concern, emitted on publish).

## `CreatePostFromCluster` behavior (core; RED-covered)

1. `api-gateway`: validated session → `user_id`; body `{ resultId, nodeId, title? }`.
2. Service: `ClusterClient.getClusteringResult({ result_id, user_id })`
   (owner-scoped — another user's result → NOT_FOUND) → tree.
3. DFS-find the node by `node_id`; absent → NOT_FOUND.
4. Traverse the subtree in tree order (children by `ordinal`, then `items`) →
   ordered `photo_id` list (dedup guard; a photo enters at exactly one node).
5. Seed: `date_from`/`date_to` ← node; `location_label = ''`; `status = draft`;
   `visibility = private`; `title = title || ''`; `body = ''`; `map_enabled = false`;
   `slug = null`; `source_cluster_id = node_id`; `source_result_id = result_id`;
   `id = uuidv7`.
6. Insert `posts` + `post_photos` (`order` = index, `caption = ''`); return the
   `Post` with photos.
7. `GetPost`/`ListPosts`/`UpdatePost` are all owner-scoped by `user_id`
   (another user's post → NOT_FOUND).

## api-gateway (thin edge — no domain logic)

`PublicationClient` (`src/grpc/publication.client.ts`) +
`PublicationController` (`src/http/publication.controller.ts`, `@Controller('v1')`):
`POST /posts` (create-from-cluster), `GET /posts`, `GET /posts/:postId`,
`PATCH /posts/:postId`. Enum → string mapping (as `ClusterController`). Registered
in `app.module.ts`. Must not connect to any DB.

## Infra

- `.env.example`: `PUBLICATION_SERVICE_GRPC_PORT=50058`,
  `PUBLICATION_DATABASE_URL=postgresql://publication_user:publication_pass@postgres:5432/publication_db`.
- `docker-compose.yml` `publication-service`: env (`LOG_LEVEL`,
  `PUBLICATION_DATABASE_URL`, `PUBLICATION_SERVICE_GRPC_PORT`,
  `CLUSTER_SERVICE_GRPC_URL`), `depends_on` postgres (healthy) + cluster-service,
  `ports "50058:50058"`. `api-gateway` env += `PUBLICATION_SERVICE_GRPC_URL:
  publication-service:${PUBLICATION_SERVICE_GRPC_PORT}`.
- Makefile: `migrate-publication` (added to the `migrate` aggregate);
  `smoke-publication` (+ `scripts/smoke-publication.sh`).

## Verification

- **RED (vitest; in-memory repo + fake `ClusterClient`):**
  (a) create-from-cluster seeds subtree photos in tree order + `date_from`/`date_to`,
  `status=draft`, `visibility=private`, `location_label` empty;
  (b) ownership scoping on Get/List/Update (another user → NOT_FOUND);
  (c) node not found in result → error.
  The DB path is covered by the smoke (as `photo-service`'s list SQL; an in-process
  DB test is the deferred `photo_ops-4vg`), not an in-process DB test.
- **`smoke-publication.sh` (dqb — new service + DB + HTTP↔gRPC + cluster read):**
  reuses the `smoke-cluster` fixture → `ready` result → picks a `node_id` from the
  tree → `POST /v1/posts { resultId, nodeId }` → asserts photos + seeded dates +
  `status=draft` → `GET /v1/posts/:id` + list contains it → `PATCH` title → assert.
- `make gate` + `make coverage-gate` (100% new/changed) + `make test-guard` +
  final `/code-review`.

## Out of scope (seams)

- slug + `PublishPost`/`UnpublishPost` + `published_at` population + usage
  `post_published` event → **019**.
- `post_photos` mutation (reorder / caption / add / remove) → editor **018**
  (extends `UpdatePost`).
- `location_label` seeding (no cluster source) → editor / future geocoding.
- public `/posts/[slug]` page, map rendering, share/copy-link → 019 / 020.
- In-process DB (testcontainers) test → deferred `photo_ops-4vg`.

## ADR

Record **ADR-0006** for the durable why: (1) a post snapshots the membership of a
node subtree (immutable results + editable posts); (2) `publication-service` reads
`cluster-service` itself (thin gateway; domain seeding in the service). Authored in
this session once the skeleton settles.
