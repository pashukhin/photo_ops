# Publish + public /posts/[slug] page — Skeleton Commit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to fill this skeleton task-by-task — each task makes its RED tests green within the provided stubs. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user publishes a draft (opaque slug + `published_at` + public/unlisted visibility) and an anonymous visitor sees the story at `/posts/[slug]` via prepared photo variants; Unpublish returns 404; publishing emits a `post_published` usage event.

**Architecture / WHY:** Contract → `proto/publication/v1/publication_service.proto` (+`PublishPost`/`UnpublishPost`/`GetPublicPostBySlug`) and `proto/photo/v1/photo_service.proto` (+`GetVariantsByIds`). Behavior → the `*.spec.ts(x)` files below. Public delivery is owner-scoped batched variant resolution behind a slug gate (never originals); the usage publisher is lazy/fire-and-forget so a down broker never blocks a post RPC. Durable why/invariants: `docs/superpowers/specs/2026-07-06-publish-public-page-design.md`, ADR-0006, the per-service `## Local invariants`.

**Tech Stack:** NestJS gRPC/TS (publication-, photo-service), NestJS HTTP (api-gateway), Next 15 server components (web), Drizzle/Postgres, RabbitMQ (amqplib) + protobufjs, vitest.

## Global Constraints

- Proto-first: edit `.proto`, then `make proto`; commit the regenerated `packages/proto-ts/**` in the SAME change. `make proto` uses a **remote** BSR plugin and may be rate-limited — **retry until the generated artifacts actually change** (a clean tree after a proto edit = stale artifacts = CI-red). Nothing fails to compile locally (all runtime `@grpc/proto-loader` + `@GrpcMethod`); the only failure surface is CI `proto-check`.
- Owner scope: cross-service ids are UUID v7, no cross-service FK. Public delivery uses prepared **variants**, never originals.
- New/changed lines must hit `make coverage-gate` (`diff-cover --fail-under 100`). IO/bootstrap adapters (repositories, broker adapters, `main.ts`, `app.module.ts`) are coverage-excluded and covered by the live smoke instead — keep new adapter code inside those excluded paths (or add the exclude) and put its assertions in the smoke.
- Emit provider from `USAGE_PROVIDER` (`local-demo`); broker url from `RABBITMQ_URL`.

## Non-Goals

- Share / copy-link / share-text / og-meta (020). Map rendering (`map_enabled` honored later). Markdown body (stays plain). `location_label` editing UI + node-owned location + geocoding. A public posts **listing** / discovery (unlisted stays link-only). Inline visibility change on a published post (change = Unpublish → Publish again). A transactional outbox for usage. `e9g` items #2–#6. Fully retiring the editor's `listPhotos(500)` (`e9g #1`) — the batch RPC is built, but wiring the owner editor to it (needs an authed gateway by-ids route) is out of scope.

---

### Task 1: Proto contract delta + regenerate

**Files:**
- Modify: `proto/publication/v1/publication_service.proto` (add 3 RPCs + 3 request messages)
- Modify: `proto/photo/v1/photo_service.proto` (add 1 RPC + 2 messages)
- Regenerate: `packages/proto-ts/**` (via `make proto`)

**Interfaces (Produces):** the wire contract every later task consumes. Add to publication:

```proto
// service PublicationService gains:
rpc PublishPost(PublishPostRequest) returns (Post) {
  option (google.api.http) = { post: "/v1/posts/{post_id}/publish" body: "*" };
}
rpc UnpublishPost(UnpublishPostRequest) returns (Post) {
  option (google.api.http) = { post: "/v1/posts/{post_id}/unpublish" body: "*" };
}
// Public, unauthenticated read gate: returns a published post ONLY when its
// visibility is public|unlisted, else NOT_FOUND. No user_id (not owner-scoped);
// the returned Post carries the owner user_id internally for variant resolution.
rpc GetPublicPostBySlug(GetPublicPostBySlugRequest) returns (Post) {
  option (google.api.http) = { get: "/v1/public/posts/{slug}" };
}

message PublishPostRequest {
  string post_id = 1;
  string user_id = 2;                 // owner scope
  PostVisibility visibility = 3;      // must be PUBLIC or UNLISTED
}
message UnpublishPostRequest {
  string post_id = 1;
  string user_id = 2;                 // owner scope
}
message GetPublicPostBySlugRequest {
  string slug = 1;
}
```

Add to photo (`internal` — no http annotation, like `ListPhotoSpacetime`):

```proto
// service PhotoService gains:
rpc GetVariantsByIds(GetVariantsByIdsRequest) returns (GetVariantsByIdsResponse);

message GetVariantsByIdsRequest {
  string user_id = 1;                 // owner scope
  repeated string photo_id = 2;
}
message PhotoVariantsForId {
  string photo_id = 1;
  repeated PhotoVariantView variants = 2;   // reuse the existing message
}
message GetVariantsByIdsResponse {
  repeated PhotoVariantsForId results = 1;
}
```

- [ ] **Step 1: Edit both `.proto` files** with the additions above (place messages after the existing ones; keep field numbers as shown).
- [ ] **Step 2: Regenerate** — `make proto` (retry on BSR rate-limit until it succeeds).
- [ ] **Step 3: Confirm artifacts changed** — `git status --short packages/proto-ts` must list modified `publication/v1/*.ts` and `photo/v1/*.ts`. A clean tree here means regeneration failed — do not proceed.
- [ ] **Step 4: Typecheck** — `make typecheck` (Expected: clean; runtime loaders mean no import breaks).
- [ ] **Step 5: Commit** — `git add proto packages/proto-ts && git commit -m "skeleton(019): proto — Publish/Unpublish/GetPublicPostBySlug + GetVariantsByIds"`

---

### Task 2: publication-db — unique slug index + Makefile target

**Files:**
- Create: `apps/publication-service/migrations/0002_publish_slug_unique.sql`
- Modify: `apps/publication-service/src/db/schema.ts` (add the unique index to the `posts` table builder)
- Modify: `Makefile` (`migrate-publication` target — pipe `0002` after `0001`, model on `migrate-photo`)

**Interfaces (Produces):** a `UNIQUE` index on `posts.slug` (NULLs distinct, so drafts don't collide). Defensive only — token entropy carries real uniqueness.

**GREEN obligation:** none beyond the schema/migration content; validated by the Task 9 smoke applying `make migrate` on a clean DB. (Schema/migration are coverage-excluded IO.)

- [ ] **Step 1: Write the migration** `0002_publish_slug_unique.sql`:
```sql
-- slug is minted (opaque token) only at publish; defensive uniqueness. NULLs are
-- distinct in a standard unique index, so the many null-slug drafts don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS posts_slug_unique ON posts (slug);
```
- [ ] **Step 2: Mirror it in the Drizzle schema** (`src/db/schema.ts`, in the `posts` table's index builder callback):
```ts
slugUnique: uniqueIndex('posts_slug_unique').on(table.slug)
```
(import `uniqueIndex` from `drizzle-orm/pg-core` alongside `index`.)
- [ ] **Step 3: Edit the `migrate-publication` Makefile target** to cat/pipe `0001_create_publication_tables.sql` then `0002_publish_slug_unique.sql` (copy the two-file shape of `migrate-photo`).
- [ ] **Step 4: Confirm** — `make migrate-publication` against the running dev DB applies cleanly (idempotent `IF NOT EXISTS`).
- [ ] **Step 5: Commit** — `git commit -am "skeleton(019): publication-db unique slug index + migrate target"`

---

### Task 3: publication-service messaging (lazy publisher + post_published emitter)

**Files:**
- Create: `apps/publication-service/src/messaging/messaging.port.ts` (copy from photo-service verbatim)
- Create: `apps/publication-service/src/messaging/rabbitmq-publisher.ts` (lazy, bounded, non-throwing-at-boot; **coverage-excluded**)
- Create: `apps/publication-service/src/post/usage.codec.ts` (copy from photo-service verbatim)
- Create: `apps/publication-service/src/post/usage.emitter.ts` (stub) + `usage.emitter.spec.ts` (RED)
- Modify: `apps/publication-service/vitest.config.ts` (add `src/messaging/rabbitmq-publisher.ts` to coverage `exclude`)

**Interfaces (Produces):**
- `MessagePublisher` / `BusMessage` / `MESSAGE_PUBLISHER` (from `messaging.port.ts`).
- `export interface PostUsagePort { emitPostPublished(input: { postId: string; userId: string }): Promise<void>; }`
- `export class PostUsageEmitter implements PostUsagePort` — `constructor(publisher: MessagePublisher, provider: string)`; `export const USAGE_EVENTS_DEST = 'usage.events'`.
- `export class LazyRabbitMqPublisher implements MessagePublisher` — `constructor(url: string, opts?: { attempts?: number; delayMs?: number })`; connects lazily on first `publish`, bounded retries (default e.g. `{attempts: 2, delayMs: 500}` — NOT 15×2s), caches the connection, no auto-reconnect; a connect/publish failure rejects (the caller emits fire-and-forget, so it is swallowed). Never connects in its constructor.

**GREEN obligation:** make `usage.emitter.spec.ts` pass within the emitter + codec stubs. `LazyRabbitMqPublisher` has no unit test (coverage-excluded, exercised by the Task 9 smoke) — mirror photo-service's `rabbitmq-bus.ts` treatment.

- [ ] **Step 1: Write the RED test** `apps/publication-service/src/post/usage.emitter.spec.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { join } from 'path';
import * as protobuf from 'protobufjs';
import { PostUsageEmitter, USAGE_EVENTS_DEST } from './usage.emitter';
import { BusMessage, MessagePublisher } from '../messaging/messaging.port';

const root = protobuf.loadSync(join(process.cwd(), '../../proto/usage/v1/consumption.proto'));
const ConsumptionEventType = root.lookupType('photoops.usage.v1.ConsumptionEvent');
function decode(body: Uint8Array): { idempotencyKey: string; userId: string; provider: string;
  measurements: { eventType: string; resourceType: string; quantity: string; unit: string;
    sourceEntityType: string; sourceEntityId: string }[] } {
  return ConsumptionEventType.toObject(ConsumptionEventType.decode(body), { longs: String, defaults: true }) as never;
}
class CapturingPublisher implements MessagePublisher {
  public sent: Array<{ destination: string; msg: BusMessage }> = [];
  publish(destination: string, msg: BusMessage): Promise<void> { this.sent.push({ destination, msg }); return Promise.resolve(); }
}

describe('PostUsageEmitter', () => {
  it('emits post_published to usage.events keyed by published:{postId}', async () => {
    // why: publish is a charge-once product action — one event per post; republish
    // dedups on the idempotency key at the usage consumer.
    const pub = new CapturingPublisher();
    await new PostUsageEmitter(pub, 'local-demo').emitPostPublished({ postId: 'post-1', userId: 'u-1' });

    expect(pub.sent).toHaveLength(1);
    expect(pub.sent[0].destination).toBe(USAGE_EVENTS_DEST);
    const e = decode(pub.sent[0].msg.body);
    expect(e.idempotencyKey).toBe('published:post-1');
    expect(e.userId).toBe('u-1');
    expect(e.provider).toBe('local-demo');
    expect(e.measurements).toEqual([
      { eventType: 'post_published', resourceType: 'publication', quantity: '1', unit: 'event',
        sourceEntityType: 'post', sourceEntityId: 'post-1' }
    ]);
  });
});
```
- [ ] **Step 2: Run → RED** — `cd apps/publication-service && npx vitest run src/post/usage.emitter.spec.ts` (Expected: FAIL on the emit assertion, not import).
- [ ] **Step 3: Write the stubs** — `messaging.port.ts` + `usage.codec.ts` copied verbatim from `apps/photo-service/src/{messaging/messaging.port.ts,photo/usage.codec.ts}`; then:
```ts
// usage.emitter.ts
import { MessagePublisher } from '../messaging/messaging.port';
import { encodeConsumptionEvent } from './usage.codec';
export const USAGE_EVENTS_DEST = 'usage.events';
export interface PostUsagePort { emitPostPublished(input: { postId: string; userId: string }): Promise<void>; }
export class PostUsageEmitter implements PostUsagePort {
  constructor(private readonly publisher: MessagePublisher, private readonly provider: string) {}
  emitPostPublished(_input: { postId: string; userId: string }): Promise<void> {
    void encodeConsumptionEvent; void this.publisher; void this.provider; // GREEN is the implementer's job
    throw new Error('not implemented');
  }
}
```
```ts
// rabbitmq-publisher.ts (coverage-excluded; no unit test — smoke-covered)
import { BusMessage, MessagePublisher } from './messaging.port';
export class LazyRabbitMqPublisher implements MessagePublisher {
  constructor(private readonly url: string, private readonly opts: { attempts?: number; delayMs?: number } = {}) {}
  publish(_destination: string, _msg: BusMessage): Promise<void> {
    void this.url; void this.opts; // GREEN: lazy bounded connect on first publish, cache, no reconnect
    throw new Error('not implemented');
  }
}
```
- [ ] **Step 4: Confirm still RED + typecheck** — rerun the spec (FAIL on assertion, symbols resolve); add `'src/messaging/rabbitmq-publisher.ts'` to `vitest.config.ts` `coverage.exclude`; `make typecheck` clean.
- [ ] **Step 5: Commit** — `git commit -am "skeleton(019): publication messaging port + post_published emitter (RED) + lazy publisher stub"`

---

### Task 4: publication-service domain — publish / unpublish / getPublicPostBySlug

**Files:**
- Modify: `apps/publication-service/src/post/post.types.ts` (extend `PostPatch`)
- Modify: `apps/publication-service/src/post/post.service.ts` (`PostRepositoryPort` += `findBySlugPublic`; `PostDomainService` += 3 methods + `usage` ctor param + slug gen)
- Modify: `apps/publication-service/src/post/post.repository.ts` (implement `findBySlugPublic`; extend `updateForUser` set-builder — **coverage-excluded**, smoke-covered)
- Modify: `apps/publication-service/src/app.module.ts` (**REQUIRED** — the `PostDomainService` `useFactory` is `new PostDomainService(repository, clusters)` today; the new 3rd ctor arg makes this a typecheck error until the factory also builds `LazyRabbitMqPublisher(RABBITMQ_URL)` → `PostUsageEmitter(publisher, USAGE_PROVIDER)` and passes it in. Coverage-excluded.)
- Modify: `apps/publication-service/src/post/post.service.spec.ts` (RED — extend `createService` helper with a `usage` fake + `findBySlugPublic`; add the describes below)

**Interfaces:**
- Consumes: `PostRecord`, `PostVisibility`, `PostRepositoryPort`, `ClusterReaderPort` (existing); `PostUsagePort` (Task 3).
- Produces:
  - `PostPatch` += `status?: PostStatus; slug?: string; publishedAt?: Date | null`.
  - `PostRepositoryPort` += `findBySlugPublic(slug: string): Promise<PostRecord | null>` (published + public|unlisted only).
  - `PostDomainService` ctor becomes `(repository, clusters, usage: PostUsagePort)`.
  - `publishPost(userId: string, postId: string, visibility: PostVisibility): Promise<PostRecord>`
  - `unpublishPost(userId: string, postId: string): Promise<PostRecord>`
  - `getPublicPostBySlug(slug: string): Promise<PostRecord>`

**GREEN obligation:** make the RED tests below pass within these stubs. Slug is an opaque token (`crypto.randomBytes(12).toString('base64url')`), minted only when `current.slug` is null; `publishedAt` set only when null. Emit is **fire-and-forget** (`void this.usage.emitPostPublished(...).catch(...)` — not awaited). Repo changes are validated by the Task 9 smoke.

- [ ] **Step 1: Write the RED tests** — extend `post.service.spec.ts`. First update the shared helper:
```ts
// in createService(...), add to the repository fake:
//   findBySlugPublic: vi.fn(),
// add a usage fake and pass it to the ctor:
const usage = { emitPostPublished: vi.fn().mockResolvedValue(undefined) };
return { service: new PostDomainService(repository, clusters, usage), repository, clusters, usage };
```
Then add:
```ts
describe('PostDomainService.publishPost', () => {
  it('publishes a draft: sets status/visibility, mints an opaque slug + published_at, emits once', async () => {
    // why: first publish is the atomic "publish as <visibility>" transition — slug
    // and published_at are minted here (empty until now) and a usage event fires.
    const current = makePostRecord(); // draft, slug null, publishedAt null
    const updateForUser = vi.fn().mockResolvedValue(makePostRecord({ status: 'published', visibility: 'public' }));
    const { service, usage } = createService({
      repository: { findByIdForUser: vi.fn().mockResolvedValue(current), updateForUser }
    });

    await service.publishPost('user-1', 'post-1', 'public');

    const patch = updateForUser.mock.calls[0][2];
    expect(patch.status).toBe('published');
    expect(patch.visibility).toBe('public');
    expect(patch.slug).toMatch(/^[A-Za-z0-9_-]{16,}$/); // opaque, unguessable token
    expect(patch.publishedAt).toBeInstanceOf(Date);
    expect(usage.emitPostPublished).toHaveBeenCalledWith({ postId: 'post-1', userId: 'user-1' });
  });

  it('republish keeps the existing slug and published_at (immutable)', async () => {
    // why: links + first-published-at stay stable across unpublish → republish.
    const at = new Date('2026-07-01T00:00:00.000Z');
    const current = makePostRecord({ status: 'unpublished', slug: 'frozenSlugToken00', publishedAt: at });
    const updateForUser = vi.fn().mockResolvedValue(makePostRecord({ status: 'published', slug: 'frozenSlugToken00', publishedAt: at }));
    const { service } = createService({ repository: { findByIdForUser: vi.fn().mockResolvedValue(current), updateForUser } });

    await service.publishPost('user-1', 'post-1', 'unlisted');

    const patch = updateForUser.mock.calls[0][2];
    expect(patch.slug).toBeUndefined();        // not regenerated
    expect(patch.publishedAt).toBeUndefined(); // not overwritten
    expect(patch.status).toBe('published');
    expect(patch.visibility).toBe('unlisted');
  });

  it('rejects publishing as private (guarded before any write)', async () => {
    // why: private cannot be a public/unlisted publication (defense in depth behind the gateway 400).
    const { service, repository } = createService();
    await expect(service.publishPost('user-1', 'post-1', 'private')).rejects.toThrow('cannot publish private');
    expect(repository.updateForUser).not.toHaveBeenCalled();
  });

  it('rejects when the post is absent or not owned', async () => {
    const { service } = createService({ repository: { findByIdForUser: vi.fn().mockResolvedValue(null) } });
    await expect(service.publishPost('user-1', 'ghost', 'public')).rejects.toThrow('post not found');
  });

  it('still resolves when the usage emit fails (fire-and-forget, best-effort)', async () => {
    // why: D6 — usage is a side channel; a broker/emit failure must NOT fail or
    // roll back publish. The emit is dispatched, its rejection swallowed.
    const updateForUser = vi.fn().mockResolvedValue(makePostRecord({ status: 'published', visibility: 'public' }));
    const { service, usage } = createService({
      repository: { findByIdForUser: vi.fn().mockResolvedValue(makePostRecord()), updateForUser }
    });
    usage.emitPostPublished.mockRejectedValue(new Error('broker down'));

    await expect(service.publishPost('user-1', 'post-1', 'public')).resolves.toBeDefined();
    expect(usage.emitPostPublished).toHaveBeenCalled();
  });
});

describe('PostDomainService.unpublishPost', () => {
  it('flips status to unpublished, touching nothing else, emitting nothing', async () => {
    const updateForUser = vi.fn().mockResolvedValue(makePostRecord({ status: 'unpublished' }));
    const { service, usage } = createService({ repository: { updateForUser } });
    await service.unpublishPost('user-1', 'post-1');
    expect(updateForUser).toHaveBeenCalledWith('user-1', 'post-1', { status: 'unpublished' });
    expect(usage.emitPostPublished).not.toHaveBeenCalled();
  });

  it('rejects when the post is absent or not owned', async () => {
    const { service } = createService({ repository: { updateForUser: vi.fn().mockResolvedValue(null) } });
    await expect(service.unpublishPost('user-1', 'ghost')).rejects.toThrow('post not found');
  });
});

describe('PostDomainService.getPublicPostBySlug', () => {
  it('returns the post for a slug of a published public/unlisted post', async () => {
    const rec = makePostRecord({ status: 'published', visibility: 'public', slug: 'tok' });
    const findBySlugPublic = vi.fn().mockResolvedValue(rec);
    const { service } = createService({ repository: { findBySlugPublic } });
    const result = await service.getPublicPostBySlug('tok');
    expect(findBySlugPublic).toHaveBeenCalledWith('tok');
    expect(result).toBe(rec);
  });

  it('rejects (not found) when no published public/unlisted post has the slug', async () => {
    // why: draft/unpublished/private/unknown all collapse to not-found — no leak.
    const { service } = createService({ repository: { findBySlugPublic: vi.fn().mockResolvedValue(null) } });
    await expect(service.getPublicPostBySlug('tok')).rejects.toThrow('post not found');
  });
});
```
- [ ] **Step 2: Run → RED** — `npx vitest run src/post/post.service.spec.ts` (Expected: the new describes FAIL on behavior; existing ones stay green after the helper edit).
- [ ] **Step 3: Write the stubs**:
```ts
// post.types.ts — extend PostPatch:
export interface PostPatch {
  title?: string; body?: string; visibility?: PostVisibility; locationLabel?: string;
  mapEnabled?: boolean; dateFrom?: Date | null; dateTo?: Date | null;
  photos?: PostPhotoInput[];
  status?: PostStatus;            // 019
  slug?: string;                  // 019 — set only at first publish
  publishedAt?: Date | null;      // 019 — set only at first publish
}
```
```ts
// post.service.ts — PostRepositoryPort gains:
findBySlugPublic(slug: string): Promise<PostRecord | null>;
// PostDomainService — new ctor param + methods:
constructor(
  private readonly repository: PostRepositoryPort,
  private readonly clusters: ClusterReaderPort,
  private readonly usage: PostUsagePort
) {}
async publishPost(_userId: string, _postId: string, _visibility: PostVisibility): Promise<PostRecord> {
  throw new Error('not implemented');
}
async unpublishPost(_userId: string, _postId: string): Promise<PostRecord> {
  throw new Error('not implemented');
}
async getPublicPostBySlug(_slug: string): Promise<PostRecord> {
  throw new Error('not implemented');
}
```
```ts
// post.repository.ts — stub the port additions (coverage-excluded):
async findBySlugPublic(_slug: string): Promise<PostRecord | null> { throw new Error('not implemented'); }
// and extend updateForUser's set-builder to carry status/slug/publishedAt when present.
```
Then wire the emitter into the `PostDomainService` factory in `app.module.ts` (so the new required 3rd ctor arg typechecks — B1):
```ts
// app.module.ts — extend the existing PostDomainService useFactory:
{
  provide: PostDomainService,
  useFactory: (repo: PostRepository, clusters: ClusterReader) => {
    const publisher = new LazyRabbitMqPublisher(process.env.RABBITMQ_URL ?? 'amqp://guest:guest@rabbitmq:5672');
    const usage = new PostUsageEmitter(publisher, process.env.USAGE_PROVIDER ?? 'local-demo');
    return new PostDomainService(repo, clusters, usage);
  },
  inject: [PostRepository, ClusterReader]
}
```
- [ ] **Step 4: Confirm still RED + typecheck** — rerun the spec (new tests FAIL on assertion; symbols resolve); `make typecheck` clean (this is why the `app.module.ts` wiring is part of THIS task — the 3-arg ctor won't compile without it).
- [ ] **Step 5: Commit** — `git commit -am "skeleton(019): publication domain publish/unpublish/getPublicPostBySlug (RED) + stubs"`

---

### Task 5: publication-service gRPC controller — Publish / Unpublish / GetPublicPostBySlug

**Files:**
- Modify: `apps/publication-service/src/post/post.grpc.controller.ts` (3 handlers + `'cannot publish private'` → INVALID_ARGUMENT)
- Modify: `apps/publication-service/src/post/post.grpc.controller.spec.ts` (RED)

**Interfaces:**
- Consumes: `PostDomainService.publishPost/unpublishPost/getPublicPostBySlug` (Task 4), `PROTO_TO_VISIBILITY`, `toProtoPost`, `mapDomainError` (existing).
- Produces gRPC handlers: `PublishPost(req: { postId; userId; visibility: number })`, `UnpublishPost(req: { postId; userId })`, `GetPublicPostBySlug(req: { slug })` → all return a `ProtoPost`.

**GREEN obligation:** make the RED tests pass. Map `visibility` number → string via `PROTO_TO_VISIBILITY` (an unknown/`0` → `undefined`, which the domain rejects as `'cannot publish private'`). Add `'cannot publish private'` to `INVALID_ARGUMENT_MESSAGES`.

- [ ] **Step 1: Write the RED tests** (append to `post.grpc.controller.spec.ts`, matching its existing style — construct the controller with a fake `PostDomainService`):
```ts
describe('PublicationGrpcController publish/unpublish/public', () => {
  it('PublishPost maps the visibility enum to a string and returns a proto post', async () => {
    const publishPost = vi.fn().mockResolvedValue(makePostRecord({ status: 'published', visibility: 'public', slug: 'tok' }));
    const { controller } = createController({ publishPost });
    const res = await controller.PublishPost({ postId: 'post-1', userId: 'user-1', visibility: 3 });
    expect(publishPost).toHaveBeenCalledWith('user-1', 'post-1', 'public');
    expect(res.status).toBe(2); // PUBLISHED
    expect(res.slug).toBe('tok');
  });

  it('PublishPost surfaces "cannot publish private" as INVALID_ARGUMENT', async () => {
    const publishPost = vi.fn().mockRejectedValue(new Error('cannot publish private'));
    const { controller } = createController({ publishPost });
    await expect(controller.PublishPost({ postId: 'post-1', userId: 'user-1', visibility: 1 }))
      .rejects.toMatchObject({ code: status.INVALID_ARGUMENT });
  });

  it('UnpublishPost calls the domain owner-scoped and returns the proto post', async () => {
    const unpublishPost = vi.fn().mockResolvedValue(makePostRecord({ status: 'unpublished' }));
    const { controller } = createController({ unpublishPost });
    const res = await controller.UnpublishPost({ postId: 'post-1', userId: 'user-1' });
    expect(unpublishPost).toHaveBeenCalledWith('user-1', 'post-1');
    expect(res.status).toBe(3); // UNPUBLISHED
  });

  it('GetPublicPostBySlug returns the proto post; a miss is NOT_FOUND', async () => {
    const getPublicPostBySlug = vi.fn().mockResolvedValue(makePostRecord({ status: 'published', visibility: 'public', slug: 'tok' }));
    const { controller } = createController({ getPublicPostBySlug });
    expect((await controller.GetPublicPostBySlug({ slug: 'tok' })).slug).toBe('tok');

    const miss = createController({ getPublicPostBySlug: vi.fn().mockRejectedValue(new Error('post not found')) });
    await expect(miss.controller.GetPublicPostBySlug({ slug: 'ghost' }))
      .rejects.toMatchObject({ code: status.NOT_FOUND });
  });
});
```
(`status` from `@grpc/grpc-js`; the file's existing `createController` accepts a `Partial<PostDomainService>` — extend it with the three new methods; the record fixture is `makePostRecord`.)
- [ ] **Step 2: Run → RED** — `npx vitest run src/post/post.grpc.controller.spec.ts` (FAIL on behavior).
- [ ] **Step 3: Write the stub handlers** — three `@GrpcMethod('PublicationService', 'PublishPost'|'UnpublishPost'|'GetPublicPostBySlug')` methods whose bodies `throw new Error('not implemented')`; add `'cannot publish private'` to `INVALID_ARGUMENT_MESSAGES` now (so the domain-error mapping resolves). Keep the handlers as stubs — GREEN is the implementer's job.
- [ ] **Step 4: Confirm still RED + typecheck** (handlers throw → tests FAIL on assertion; symbols resolve), then **Step 5: Commit** — `git commit -am "skeleton(019): publication gRPC publish/unpublish/public handlers (RED)"`

---

### Task 6: photo-service — GetVariantsByIds (batched, owner-scoped)

**Files:**
- Modify: `apps/photo-service/src/photo/photo.service.ts` (`PhotoRepositoryPort` += `findVariantsByIdsForUser`; `PhotoDomainService` += `getVariantsByIds`)
- Modify: `apps/photo-service/src/photo/photo.repository.ts` (implement it — **coverage-excluded**, smoke-covered)
- Modify: `apps/photo-service/src/photo/photo.grpc.controller.ts` (`GetVariantsByIds` handler)
- Modify: `apps/photo-service/src/photo/photo.service.spec.ts` + `photo.grpc.controller.spec.ts` (RED)

**Interfaces (Produces):**
- `PhotoRepositoryPort` += `findVariantsByIdsForUser(userId: string, photoIds: string[]): Promise<{ photoId: string; variants: PhotoVariantRecord[] }[]>` (owner-scoped: photos `WHERE user_id AND id IN (…)`, then their variants; foreign/absent ids simply absent).
- `PhotoDomainService.getVariantsByIds(userId: string, photoIds: string[]): Promise<{ photoId: string; variants: PhotoVariantView[] }[]>` (maps each via existing `toVariantView` — presigns the **variant** objectKey, never an original).
- gRPC handler `GetVariantsByIds(req: { userId: string; photoId: string[] })` → `{ results: [{ photoId, variants: [{ variantType, url, width, height }] }] }`.

**GREEN obligation:** make the RED tests pass within these stubs.

- [ ] **Step 1: Write the RED tests**. NOTE: the existing `createService()` (`photo.service.spec.ts`) and `createController()` (`photo.grpc.controller.spec.ts`) currently take **no arguments** and build fixed fakes — first **refactor each to accept an overrides object** (mirror publication-service's `createService({ repository, ... })` pattern: spread overrides onto the default fakes, return the built service/controller + the fakes). `PhotoDomainService` needs all 5 ctor args (repository, storage, publisher, logger, usageEmitter). Then add `findVariantsByIdsForUser` to the default repo fake and keep the default `createPresignedGetUrl` storage fake. Service test:
```ts
describe('PhotoDomainService.getVariantsByIds', () => {
  it('resolves owner-scoped variant views for the given ids, omitting non-owned/absent ids', async () => {
    // why: public delivery batches a published post's photo_ids → variant URLs in
    // one call; a non-owned/unknown id is silently absent (no leak); only variants
    // (never originals) carry a URL.
    const repo = { findVariantsByIdsForUser: vi.fn().mockResolvedValue([
      { photoId: 'p1', variants: [{ id: 'v1', photoId: 'p1', variantType: 'thumbnail', objectKey: 'k1', width: 40, height: 40, sizeBytes: 1n, contentType: 'image/jpeg' }] }
    ]) };
    const storage = { createPresignedGetUrl: vi.fn().mockResolvedValue('http://img/k1') };
    const { service } = createService({ repository: repo, storage }); // helper extended to accept overrides

    const result = await service.getVariantsByIds('user-1', ['p1', 'pX']);

    expect(repo.findVariantsByIdsForUser).toHaveBeenCalledWith('user-1', ['p1', 'pX']);
    expect(result).toEqual([
      { photoId: 'p1', variants: [{ variantType: 'thumbnail', url: 'http://img/k1', width: 40, height: 40 }] }
    ]);
  });
});
```
Controller (`photo.grpc.controller.spec.ts`):
```ts
it('GetVariantsByIds delegates owner-scoped and wraps the results', async () => {
  const getVariantsByIds = vi.fn().mockResolvedValue([
    { photoId: 'p1', variants: [{ variantType: 'thumbnail', url: 'http://img/k1', width: 40, height: 40 }] }
  ]);
  const { controller } = createController({ getVariantsByIds });
  const res = await controller.GetVariantsByIds({ userId: 'user-1', photoId: ['p1'] });
  expect(getVariantsByIds).toHaveBeenCalledWith('user-1', ['p1']);
  expect(res).toEqual({ results: [{ photoId: 'p1', variants: [{ variantType: 'thumbnail', url: 'http://img/k1', width: 40, height: 40 }] }] });
});
```
- [ ] **Step 2: Run → RED** — `cd apps/photo-service && npx vitest run src/photo/photo.service.spec.ts src/photo/photo.grpc.controller.spec.ts` (FAIL on behavior).
- [ ] **Step 3: Write the stubs** — port method + `getVariantsByIds` (`throw new Error('not implemented')`), repo impl stub (coverage-excluded), and the `@GrpcMethod('PhotoService', 'GetVariantsByIds')` handler stub.
- [ ] **Step 4: Confirm still RED + typecheck**, then **Step 5: Commit** — `git commit -am "skeleton(019): photo-service GetVariantsByIds batched owner-scoped (RED)"`

---

### Task 7: api-gateway — publish/unpublish routes + public slug route

**Files:**
- Modify: `apps/api-gateway/src/grpc/publication.client.ts` (+ `publishPost`, `unpublishPost`, `getPublicPostBySlug`)
- Modify: `apps/api-gateway/src/grpc/photo.client.ts` (+ `getVariantsByIds`)
- Modify: `apps/api-gateway/src/http/publication.controller.ts` (publish/unpublish authed + public route + `mapPublicPost`; inject `PhotoClient`)
- Modify: `apps/api-gateway/src/http/publication.controller.spec.ts` (RED)

**Interfaces:**
- Consumes: proto RPCs (Task 1). `PhotoClient.getVariantsByIds(input: { userId: string; photoIds: string[] }): Promise<{ results: { photoId: string; variants: { variantType: string; url: string; width: number; height: number }[] }[] }>`.
- Produces on `PublicationClient`: `publishPost(input: { userId; postId; visibility: number }): Promise<PostRaw>`; `unpublishPost(input: { userId; postId }): Promise<PostRaw>`; `getPublicPostBySlug(slug: string): Promise<PostRaw>`.
- Produces routes: `POST /v1/posts/:postId/publish`, `POST /v1/posts/:postId/unpublish` (authed), `GET /v1/public/posts/:slug` (NO `requireSession`).

**GREEN obligation:** make the RED tests pass. `publishPost` rejects `private`/unknown/absent visibility with an **explicit** 400 (NOT the `VISIBILITY_TO_PROTO` lookup, which contains `private:1`). The public route resolves variants via `getVariantsByIds(ownerUserId, photoIds)` and returns an allow-list DTO (`mapPublicPost`) with **no** `userId`/`status`/`visibility`/`sourceClusterId`/`sourceResultId`. A NOT_FOUND from the client → the gateway 404 (existing `HttpErrorFilter`); other errors → 500.

- [ ] **Step 1: Write the RED tests** (extend `publication.controller.spec.ts`; add `publishPost`/`unpublishPost`/`getPublicPostBySlug` to the `publicationClient` mock, a `photoClient = { getVariantsByIds: vi.fn() }`, and pass it into the controller ctor):
```ts
describe('PublicationController publish/unpublish/public', () => {
  it('publishPost: maps the visibility string to the proto enum, owner-scoped', async () => {
    const { controller, publicationClient } = createController();
    vi.mocked(publicationClient.publishPost).mockResolvedValue(makePostRaw({ status: 2, visibility: 3, slug: 'tok', publishedAt: '2026-07-06T00:00:00.000Z' }));
    const res = (await controller.publishPost('photoops_session=s', 'post-1', { visibility: 'public' })) as { status: string; slug: string };
    expect(publicationClient.publishPost).toHaveBeenCalledWith({ userId: 'user-1', postId: 'post-1', visibility: 3 });
    expect(res.status).toBe('published');
    expect(res.slug).toBe('tok');
  });

  it('publishPost: rejects visibility=private with 400 and never calls the client', async () => {
    // why: VISIBILITY_TO_PROTO includes private:1 — the publish edge needs an
    // EXPLICIT reject, not the updatePost lookup pattern.
    const { controller, publicationClient } = createController();
    await expect(controller.publishPost('photoops_session=s', 'post-1', { visibility: 'private' })).rejects.toBeInstanceOf(BadRequestException);
    expect(publicationClient.publishPost).not.toHaveBeenCalled();
  });

  it('publishPost: rejects an unknown or absent visibility with 400', async () => {
    const { controller } = createController();
    await expect(controller.publishPost('photoops_session=s', 'post-1', { visibility: 'pubic' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.publishPost('photoops_session=s', 'post-1', {} as never)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('unpublishPost: owner-scoped, maps the result', async () => {
    const { controller, publicationClient } = createController();
    vi.mocked(publicationClient.unpublishPost).mockResolvedValue(makePostRaw({ status: 3 }));
    const res = (await controller.unpublishPost('photoops_session=s', 'post-1')) as { status: string };
    expect(publicationClient.unpublishPost).toHaveBeenCalledWith({ userId: 'user-1', postId: 'post-1' });
    expect(res.status).toBe('unpublished');
  });

  it('publicPost: resolves a published post by slug with variant urls, leaking no owner/status fields, no session', async () => {
    const { controller, publicationClient, photoClient, authService } = createController();
    vi.mocked(publicationClient.getPublicPostBySlug).mockResolvedValue(makePostRaw({
      status: 2, visibility: 3, slug: 'tok', title: 'Trip', body: 'day one',
      photos: [{ photoId: 'p1', order: 0, caption: 'first' }]
    }));
    vi.mocked(photoClient.getVariantsByIds).mockResolvedValue({
      results: [{ photoId: 'p1', variants: [{ variantType: 'thumbnail', url: 'http://img/p1', width: 40, height: 40 }] }]
    });

    const res = (await controller.publicPost('tok')) as Record<string, unknown>;

    expect(authService.requireSession).not.toHaveBeenCalled(); // public route
    expect(publicationClient.getPublicPostBySlug).toHaveBeenCalledWith('tok');
    expect(photoClient.getVariantsByIds).toHaveBeenCalledWith({ userId: 'user-1', photoIds: ['p1'] });
    for (const leaked of ['userId', 'status', 'visibility', 'sourceClusterId', 'sourceResultId']) {
      expect(res).not.toHaveProperty(leaked);
    }
    expect(res.slug).toBe('tok');
    expect(res.title).toBe('Trip');
    expect(res.photos).toEqual([
      { order: 0, caption: 'first', variants: [{ variantType: 'thumbnail', url: 'http://img/p1', width: 40, height: 40 }] }
    ]);
  });
});
```
- [ ] **Step 2: Run → RED** — `cd apps/api-gateway && npx vitest run src/http/publication.controller.spec.ts` (FAIL on behavior; existing tests still green after the ctor gains `photoClient`).
- [ ] **Step 3: Write the stubs** — client methods promisified like the existing `createPostFromCluster`, EXCEPT `getVariantsByIds` must **remap `photoIds` → the proto wire field `photoId`** before the gRPC call (the wire field is `photoId` under `keepCase:false`; a literal pass-through would silently drop the ids — mirror how `updatePost` wraps `photos → { photos }` in `publication.client.ts`). Controller handlers `@Post('posts/:postId/publish')`, `@Post('posts/:postId/unpublish')`, `@Get('public/posts/:slug')` and `private mapPublicPost(...)` — bodies `throw new Error('not implemented')`. Also update `createController` in the spec to build/return the `photoClient` fake and pass it as the new 3rd ctor arg (Nest auto-resolves `PhotoClient` at runtime — already a provider — so no gateway `app.module` edit is needed).
- [ ] **Step 4: Confirm still RED + typecheck**, then **Step 5: Commit** — `git commit -am "skeleton(019): gateway publish/unpublish + public slug route (RED)"`

---

### Task 8: web — publish UI + public SSR page

**Files:**
- Modify: `apps/web/lib/api.ts` (+ `publishPost`, `unpublishPost` client calls; + server-only `getPublicPost`; + `PublicPost` type)
- Create: `apps/web/lib/api.publish.spec.ts` (RED — the three new fns against a mocked `fetch`)
- Modify: `apps/web/components/posts/PostEditor.tsx` + `PostEditor.spec.tsx` (RED — visibility selector + Publish/Unpublish + published panel)
- Create: `apps/web/app/posts/[slug]/page.tsx` + `apps/web/app/posts/[slug]/page.spec.tsx` (RED)
- Modify: `.env.example` (+ `API_BASE_URL_INTERNAL=http://api-gateway:3001`)

**Interfaces (Produces):**
- `publishPost(id: string, visibility: 'public' | 'unlisted'): Promise<Post>` and `unpublishPost(id: string): Promise<Post>` — client `fetch(POST /v1/posts/:id/publish|unpublish, { credentials: 'include' })`.
- `getPublicPost(slug: string): Promise<PublicPost | null>` — **server-only**; `fetch(\`${process.env.API_BASE_URL_INTERNAL}/v1/public/posts/${slug}\`, { cache: 'no-store' })`, no credentials; `404 → null`; other non-OK → throw.
- `PublicPost = { slug; title; body; locationLabel; dateFrom; dateTo; publishedAt; photos: { order; caption; variants: { variantType; url; width; height }[] }[] }`.
- Public page default-exports an async server component `({ params }: { params: Promise<{ slug: string }> })` with `export const dynamic = 'force-dynamic'`.

**GREEN obligation:** make the RED tests pass. Editor: a draft shows a visibility `<select>` + Publish → `publishPost(id, visibility)`; a published post shows a `/posts/<slug>` link + Unpublish → `unpublishPost(id)` and hides Publish. Public page renders title/body/date/location/photos (variant `<img alt={caption}>`) and calls `notFound()` when `getPublicPost` returns null.

- [ ] **Step 1: Write the RED tests.** `lib/api.publish.spec.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPublicPost, publishPost, unpublishPost } from './api';

afterEach(() => vi.unstubAllGlobals());
function stubFetch(res: Partial<Response> & { ok: boolean; status: number; json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue(res as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('publish/unpublish/getPublicPost api', () => {
  it('publishPost POSTs the visibility with credentials', async () => {
    const f = stubFetch({ ok: true, status: 200, json: async () => ({ id: 'post-1', status: 'published', slug: 'tok' }) });
    await publishPost('post-1', 'unlisted');
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toMatch(/\/v1\/posts\/post-1\/publish$/);
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ visibility: 'unlisted' });
  });

  it('unpublishPost POSTs to the unpublish route', async () => {
    const f = stubFetch({ ok: true, status: 200, json: async () => ({ id: 'post-1', status: 'unpublished' }) });
    await unpublishPost('post-1');
    expect(String(f.mock.calls[0][0])).toMatch(/\/v1\/posts\/post-1\/unpublish$/);
  });

  it('getPublicPost returns the DTO on 200 and null on 404 (server-side, no credentials)', async () => {
    stubFetch({ ok: true, status: 200, json: async () => ({ slug: 'tok', title: 'Trip', photos: [] }) });
    expect(await getPublicPost('tok')).toMatchObject({ slug: 'tok', title: 'Trip' });
    stubFetch({ ok: false, status: 404 });
    expect(await getPublicPost('ghost')).toBeNull();
  });
});
```
`PostEditor.spec.tsx` — extend the `vi.mock('../../lib/api', …)` to add `publishPost: vi.fn(), unpublishPost: vi.fn()`, then add:
```ts
it('publishes a draft as the selected visibility', async () => {
  // why: Publish is the atomic transition; the editor sends the chosen visibility.
  vi.mocked(api.publishPost).mockResolvedValue({ ...post(), status: 'published', visibility: 'unlisted', slug: 'tok', publishedAt: 'x' } as never);
  render(<PostEditor postId="post-1" />);
  await screen.findByDisplayValue('Trip');
  fireEvent.change(screen.getByLabelText(/visibility/i), { target: { value: 'unlisted' } });
  fireEvent.click(screen.getByRole('button', { name: /^publish$/i }));
  await waitFor(() => expect(api.publishPost).toHaveBeenCalledWith('post-1', 'unlisted'));
});

it('shows the public link + Unpublish and hides Publish once published', async () => {
  vi.mocked(api.getPost).mockResolvedValue({ ...post(), status: 'published', visibility: 'public', slug: 'tok', publishedAt: 'x' } as never);
  render(<PostEditor postId="post-1" />);
  const link = (await screen.findByRole('link', { name: /\/posts\/tok|view|public/i }));
  expect(link.getAttribute('href')).toBe('/posts/tok');
  expect(screen.getByRole('button', { name: /unpublish/i })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^publish$/i })).toBeNull();
});

it('unpublishes a published post', async () => {
  vi.mocked(api.getPost).mockResolvedValue({ ...post(), status: 'published', slug: 'tok', publishedAt: 'x' } as never);
  vi.mocked(api.unpublishPost).mockResolvedValue({ ...post(), status: 'unpublished', slug: 'tok' } as never);
  render(<PostEditor postId="post-1" />);
  fireEvent.click(await screen.findByRole('button', { name: /unpublish/i }));
  await waitFor(() => expect(api.unpublishPost).toHaveBeenCalledWith('post-1'));
});
```
`app/posts/[slug]/page.spec.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PublicPostPage from './page';
import * as api from '@/lib/api';

vi.mock('@/lib/api', () => ({ getPublicPost: vi.fn() }));
vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }) }));

const dto = {
  slug: 'tok', title: 'Trip', body: 'day one', locationLabel: '',
  dateFrom: '2024-06-15T10:00:00.000Z', dateTo: '2024-06-15T10:05:00.000Z', publishedAt: '2026-07-06T00:00:00.000Z',
  photos: [{ order: 0, caption: 'first', variants: [{ variantType: 'thumbnail', url: 'http://img/p1', width: 40, height: 40 }] }]
};

describe('PublicPostPage', () => {
  it('renders a published post (title, body, variant image) for its slug', async () => {
    // why: anonymous SSR resolves the slug to the public DTO and renders variant
    // images (never originals).
    vi.mocked(api.getPublicPost).mockResolvedValue(dto as never);
    render(await PublicPostPage({ params: Promise.resolve({ slug: 'tok' }) }));
    expect(api.getPublicPost).toHaveBeenCalledWith('tok');
    expect(screen.getByText('Trip')).toBeTruthy();
    expect(screen.getByText('day one')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'first' }).getAttribute('src')).toBe('http://img/p1');
  });

  it('calls notFound() (→404, not 500) when the slug has no published post', async () => {
    vi.mocked(api.getPublicPost).mockResolvedValue(null as never);
    await expect(PublicPostPage({ params: Promise.resolve({ slug: 'ghost' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
```
- [ ] **Step 2: Run → RED** — `cd apps/web && npx vitest run lib/api.publish.spec.ts components/posts/PostEditor.spec.tsx "app/posts/[slug]/page.spec.tsx"` (FAIL on behavior).
- [ ] **Step 3: Write the stubs** — `lib/api.ts` three functions bodied `throw new Error('not implemented')` (client `publishPost`/`unpublishPost`; server `getPublicPost`) + the `PublicPost` type. `PostEditor`: render the new controls so the queries resolve — a `<select aria-label="visibility">`, a Publish `<button>`, and (for a published post) the `/posts/<slug>` link + an Unpublish `<button>` — but leave their click handlers **unwired** (no `publishPost`/`unpublishPost` call) so the RED tests fail on behavior, not on a missing element. `app/posts/[slug]/page.tsx`: async component returning minimal markup + `export const dynamic = 'force-dynamic'` (does not yet call `getPublicPost`/`notFound` → RED).
- [ ] **Step 4: Confirm still RED + typecheck** — rerun; `make typecheck`; add `API_BASE_URL_INTERNAL` to `.env.example`.
- [ ] **Step 5: Commit** — `git commit -am "skeleton(019): web publish UI + public SSR page (RED) + api stubs"`

---

### Task 9: live smoke + compose wiring (dqb boundary)

**Files:**
- Modify: `scripts/smoke-publication.sh` (extend with publish → logged-out read → unpublish → 404)
- Modify: `infra/docker/docker-compose.yml` (`publication-service`: + `RABBITMQ_URL`, + `depends_on: rabbitmq`; `web`: + `API_BASE_URL_INTERNAL`)

**GREEN obligation:** the smoke passes on a live `make dev` + `make migrate` stack. It is the ONLY coverage of the public render path and the broker emit — assert real bytes, not just status codes.

- [ ] **Step 1: Extend `scripts/smoke-publication.sh`** after the existing owner-scoping section, using the already-created `$POST_ID` + `$COOKIE_PATH`:
  - Publish: `POST /v1/posts/$POST_ID/publish` `{"visibility":"public"}` → assert `.status=="published"`, `.slug` non-empty, `.publishedAt` non-empty.
  - **Gateway JSON, logged-out** (omit `-b`): `GET /v1/public/posts/$SLUG` → 200; assert the DTO has `.photos[0].variants[0].url` and NO `.userId`/`.status`/`.visibility`; then `curl -fsS "$VARIANT_URL" -o /dev/null -w '%{content_type}'` → an `image/*` content-type (**resolvable variant bytes**).
  - **Usage emit (end-to-end, pins D6 + the lazy publisher actually connecting):** poll `GET /v1/usage/events` (owner cookie) up to a bounded deadline until an event with `.eventType=="post_published"` and `.sourceEntityId=="$POST_ID"` appears (the AMQP hop is async; mirror the existing photo-event assertions in `smoke-usage.sh`). Its absence means the emit never reached `usage.events`.
  - Reject: publishing `{"visibility":"private"}` → HTTP 400.
  - **Web SSR, logged-out**: `GET ${WEB_BASE_URL:-http://localhost:3000}/posts/$SLUG` → 200 HTML.
  - Unpublish: `POST /v1/posts/$POST_ID/unpublish` → `.status=="unpublished"`; then logged-out `GET /v1/public/posts/$SLUG` → **404** and web `GET /posts/$SLUG` → **404**.
  - **Unlisted + republish-immutability**: `POST /v1/posts/$POST_ID/publish` `{"visibility":"unlisted"}` → assert `.slug == $SLUG` (republish keeps the token — immutable) and `.publishedAt` unchanged; then logged-out `GET /v1/public/posts/$SLUG` → **200** (published+unlisted is reachable by direct slug — the only assertion that pins the repo `findBySlugPublic` visibility filter for unlisted).
- [ ] **Step 2: Wire compose** — add `RABBITMQ_URL=${RABBITMQ_URL}` env + `rabbitmq` to `depends_on` on `publication-service`; add `API_BASE_URL_INTERNAL=http://api-gateway:3001` on `web`.
- [ ] **Step 3: Run the smoke** — `make dev && make migrate && make smoke-publication` (Expected: `[smoke-publication] OK`). This proves the wire boundary jsdom/mocks cannot (s018 lesson).
- [ ] **Step 4: Commit** — `git commit -am "skeleton(019): extend smoke — publish → logged-out public read + variant bytes → unpublish 404; compose broker/internal-url wiring"`

---

## Final gates (after all tasks GREEN)

`make gate` (typecheck + lint + build + tests) · `make coverage-gate` (diff-cover `--fail-under 100`; the new `page.tsx`, `lib/api` fns, and domain/service/controller code must all be covered by the specs above — repositories/adapters are coverage-excluded and covered by the smoke) · `make test-guard` · `make smoke-publication`. Then `/code-review`.
