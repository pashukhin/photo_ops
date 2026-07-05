# Publication Foundation Skeleton Commit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to fill this skeleton task-by-task — each task makes its RED tests green within the provided stubs. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `publication-service` as a real NestJS gRPC service owning `publication-db`, so a user can create a draft `Post` from a cluster node (snapshotting its subtree photos), read/list it, and update its scalar fields — session-authed through `api-gateway` at `/v1/posts`.

**Architecture / WHY:** Mirror `photo-service` (NestJS gRPC + Drizzle + `migrations/`). A post snapshots a cluster node's subtree photo membership into `post_photos` at creation (results are immutable — ADR-0005 — and posts are editable). `publication-service` reads the cluster tree itself (owns a `ClusterReader`), keeping `api-gateway` a thin mapper. Entry points: contract → `proto/publication/v1/publication_service.proto`; domain → `apps/publication-service/src/post/post.service.ts`; boundary → `.../post.grpc.controller.ts`; edge → `apps/api-gateway/src/http/publication.controller.ts`. Durable why → `docs/superpowers/specs/2026-07-05-publication-foundation-design.md` + ADR-0006 (authored after GREEN) + `apps/publication-service/CLAUDE.md`.

**Tech Stack:** TypeScript, NestJS 10 (gRPC microservice), Drizzle ORM + Postgres, `@grpc/proto-loader`, vitest.

## Global Constraints

- Owner scope everywhere: `user_id` is caller-supplied from the validated session in `api-gateway`; every read/update filters by `user_id`. No cross-service FK; cross-service refs are UUID v7.
- gRPC port `PUBLICATION_SERVICE_GRPC_PORT=50058`; DB `PUBLICATION_DATABASE_URL` (publication-db only — never another service's DB).
- Proto enum numbers are the contract: `PostStatus` draft=1/published=2/unpublished=3; `PostVisibility` private=1/unlisted=2/public=3. `Date|null` ↔ ISO-string|"" at the gRPC boundary.
- `location_label` is NEVER seeded from the cluster (the cluster carries no place — ADR-0005 decision 9); it stays `''` on a new draft.
- Proto-first: edit `.proto`, run `make proto`, keep `packages/proto-ts` staged in the same change.

## Non-Goals (session 019 / 018 seams)

- slug generation, `PublishPost`/`UnpublishPost`, `published_at` population, usage `post_published` event → **019** (columns/fields exist but stay empty).
- `post_photos` mutation (reorder / caption / add / remove) → editor **018** (extends `UpdatePost`).
- public `/posts/[slug]` page, map rendering, share/copy-link → 019 / 020.
- In-process DB (testcontainers) test → deferred `photo_ops-4vg`; the DB + cluster-read paths are covered by the live `make smoke-publication`.

---

### Task 1: PostDomainService (create-from-cluster seeding + owner scoping)

**Files:**
- Fill: `apps/publication-service/src/post/post.service.ts` (`PostDomainService` — 4 stubbed methods reject `not implemented`)
- Test (RED, committed): `apps/publication-service/src/post/post.service.spec.ts`

**Interfaces:**
- Consumes: `PostRepositoryPort` (`createPostWithPhotos`, `findByIdForUser`, `listForUser`, `updateForUser`) and `ClusterReaderPort` (`getResult({resultId,userId})`) — both defined in `post.service.ts`; domain types in `post.types.ts`.
- Produces: `PostDomainService.createPostFromCluster(input) / getPost / listPosts / updatePost`.

**GREEN obligation:** make `post.service.spec.ts` pass within the stubs. The RED tests pin: `createPostFromCluster` reads the owner-scoped result (null → throw `cluster result not found`), DFS-locates `nodeId` (absent → throw `cluster node not found`), collects the subtree photos in tree order (items-then-children pre-order) into `CreatePostRow` (`order` = index, `caption=''`), seeds `date_from`/`date_to` from the node and `status=draft`/`visibility=private`/`body=''`/`slug=null`/`locationLabel=''`/`mapEnabled=false`, and returns the repo result; `getPost`/`updatePost` throw `post not found` when the repo returns null. You may add narrower tests; do not weaken these.

- [ ] Confirm RED: `pnpm --filter @photoops/publication-service test` (fails on the assertions above)
- [ ] Implement the domain logic; re-run to GREEN + `make typecheck`
- [ ] Commit

### Task 2: PublicationGrpcController (proto↔domain mapping)

**Files:**
- Fill: `apps/publication-service/src/post/post.grpc.controller.ts` (4 stubbed `@GrpcMethod`s)
- Test (RED, committed): `apps/publication-service/src/post/post.grpc.controller.spec.ts`

**Interfaces:**
- Consumes: `PostDomainService`; proto shapes `ProtoPost`/`ProtoPostSummary` (declared in the controller file).
- Produces: gRPC handlers `CreatePostFromCluster`/`GetPost`/`ListPosts`/`UpdatePost` (+ `Health`).

**GREEN obligation:** make `post.grpc.controller.spec.ts` pass. Pins: absent `title` defaults to `''` before calling the domain; `PostRecord`→`ProtoPost` maps status/visibility strings to enum numbers, `Date|null` to ISO|"", `slug`/`publishedAt` null to `''`, and photos to `{photoId,order,caption}`; `UpdatePost` builds a `PostPatch` from only present fields (visibility enum→string); a `post not found` domain error maps to an `RpcException` with `status.NOT_FOUND`.

- [ ] Confirm RED → implement mapping → GREEN + typecheck → commit

### Task 3: PostRepository (Drizzle/Postgres adapter)

**Files:**
- Fill: `apps/publication-service/src/post/post.repository.ts` (excluded from unit coverage — smoke-covered)
- Schema (done): `apps/publication-service/src/db/schema.ts`; migration `migrations/0001_create_publication_tables.sql`

**Interfaces:**
- Produces: `PostRepositoryPort` impl. `createPostWithPhotos` inserts the `posts` row + its `post_photos` rows in one transaction and returns the full `PostRecord` (with photos ordered by `order`); reads/updates are scoped by `user_id` and return `null` when no owned row matches; `listForUser` returns `PostSummaryRecord[]` (with `photoCount`).

**GREEN obligation:** no unit test (IO adapter); correctness is proven by `make smoke-publication`. Implement against the committed schema.

- [ ] Implement → `make typecheck` → commit

### Task 4: ClusterReader (cluster-service read adapter)

**Files:**
- Fill: `apps/publication-service/src/post/cluster.reader.ts` (excluded from unit coverage — smoke-covered)

**Interfaces:**
- Produces: `ClusterReaderPort.getResult({resultId,userId})` → `ClusterResultTree | null`. Hold a proto-loaded `ClusterService` gRPC client (mirror `api-gateway/src/grpc/cluster.client.ts`, `CLUSTER_SERVICE_GRPC_URL`), call `GetClusteringResult`, map to the lean `ClusterResultTree`, return `null` when the result is missing / not owned.

**GREEN obligation:** covered by `make smoke-publication`. Implement mirroring the gateway's `ClusterClient`.

- [ ] Implement → typecheck → commit

### Task 5: api-gateway PublicationController + PublicationClient

**Files:**
- Fill: `apps/api-gateway/src/http/publication.controller.ts` (4 stubbed routes) and `apps/api-gateway/src/grpc/publication.client.ts` (excluded from coverage — smoke-covered)
- Test (RED, committed): `apps/api-gateway/src/http/publication.controller.spec.ts`

**Interfaces:**
- Consumes: `PublicationClient` (`createPostFromCluster`/`getPost`/`listPosts`/`updatePost`), `AuthService.requireSession`.
- Produces: `POST /v1/posts`, `GET /v1/posts`, `GET /v1/posts/:postId`, `PATCH /v1/posts/:postId` (session-authed).

**GREEN obligation:** make `publication.controller.spec.ts` pass. Pins: every route requires the session (401 otherwise) and takes `userId` from it, never the body; `createPost` defaults `title` to `''`; enum numbers map to browser strings on the way out; `updatePost` sends only present fields and maps the `visibility` string to the proto enum number. `PublicationClient` is the proto-loader gRPC client (mirror `ClusterClient`, `PUBLICATION_SERVICE_GRPC_URL`).

- [ ] Confirm RED (`make test-api`) → implement controller + client → GREEN + typecheck → commit

### Task 6: Live smoke (dqb — new service + DB + HTTP↔gRPC + cluster read)

**Files:**
- Run (committed): `scripts/smoke-publication.sh` (`make smoke-publication`)

**GREEN obligation:** with `make dev` + `make migrate` up (incl. `migrate-publication`), `make smoke-publication` must pass: it uploads a Canon burst, clusters it, creates a post from the root node, and asserts the post is a seeded private draft with the node's photo count and dates, is owner-scoped on GET/list, and persists a PATCHed title. This is the required executable e2e for the new boundary — run it green before final review.

- [ ] `make dev` + `make migrate` → `make smoke-publication` green
- [ ] Final: `make gate` + `make coverage-gate` + `make test-guard`, then author ADR-0006 (snapshot-membership + publication-reads-cluster), then `/code-review`
