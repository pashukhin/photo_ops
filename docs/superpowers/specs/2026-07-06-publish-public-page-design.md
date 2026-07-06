# Publish + public `/posts/[slug]` page — design (session 019)

Date: 2026-07-06 · Status: accepted · Session: 019
Epic: `photo_ops-m71` · Child: `m71.4` (DoD 11-12) · Opportunistic: `photo_ops-e9g #1`
Method: exSDD / skeleton-first (`docs/agent-workflow-evolution.md` Decision 1).
Builds on: 017 (`docs/superpowers/specs/2026-07-05-publication-foundation-design.md`,
ADR-0006), 018 (`docs/superpowers/specs/2026-07-06-publication-editor-design.md`).

## Goal

Close the publication vertical's read side: a user publishes a draft (slug +
`published_at` + visibility), and an **anonymous** visitor at `/posts/[slug]` sees
the published story — title, body, date range, `location_label` (if set), and the
post's photos via **prepared variants** (never originals) with captions. Unpublish
returns the public page to 404. Publishing emits a `post_published` usage event.

One vertical slice: **editor Publish button → `PublishPost` → public SSR page
reachable logged-out; Unpublish → 404.**

## Scope

In: `PublishPost` / `UnpublishPost` RPCs (status transitions + opaque slug +
`published_at`); `GetPublicPostBySlug` (unauth read gate); a batched owner-scoped
`GetVariantsByIds` on photo-service; gateway publish/unpublish (authed) + public
unauthenticated slug route; publication-service RabbitMQ `post_published` emit;
web editor Publish/Unpublish + visibility selector; new public server-rendered
route `app/posts/[slug]/page.tsx`. The new `GetVariantsByIds` primitive lays the
groundwork for `e9g #1`; fully retiring the editor's `listPhotos(500)` over-fetch
also needs an **authed** gateway by-ids route and is opportunistic (defer if it
does not lie cleanly on the path).

Out (later): share / copy-link / share-text / og-meta (020, `m71.5`); map
rendering (`map_enabled` honored later); markdown body (§3.6 — stays plain);
`location_label` editing UI + node-owned location + reverse-geocoding (future);
a public posts listing / discovery; inline visibility change on a published post;
a transactional outbox for usage emit; the remaining `e9g` items (#2-#6).

## Decisions

### D1 — public photo delivery: batched owner-scoped `GetVariantsByIds`

The public page needs variant URLs for a post's photos with **no session**. Today
the only path to a variant URL is an owner-scoped photo-service RPC (`GetPhoto` /
`ListPhotos`); there is no anonymous path, no by-ids batch, no image-proxy.

Add a photo-service RPC `GetVariantsByIds(user_id, repeated photo_id) →
repeated { photo_id, variants[] }`, **owner-scoped** (looks up photos by
`WHERE user_id AND id IN (…)`, then their variants) and batched. It reuses the
existing `PhotoVariantView` (only variants carry presigned GET URLs — originals
are never presigned). Foreign / non-owned ids are silently absent from the result.

*Why B over N× `GetPhoto` (option A):* one round-trip instead of N, keeps the
owner-scope invariant intact (no new "presign any id" capability), and the same
by-ids primitive is the reusable basis for retiring the editor's
`listPhotos({pageSize:500})` over-fetch (`e9g #1`, opportunistic — see Scope).
*Rejected:* an anonymous public presign or a gateway byte-proxy (option C) — most
infra, and it drops the owner-scope invariant.

**Trust boundary:** the gateway calls `GetVariantsByIds` only with the owner
`user_id` and `photo_id`s it obtained from a *published* post via
`GetPublicPostBySlug`. photo-service stays owner-scoped and publication-status-blind
(cross-service); the slug gate is what authorizes public exposure.

### D2 — slug is an opaque high-entropy token, not a readable composite

slug = `crypto.randomBytes(12).toString('base64url')` (~16 chars), generated
**once at first Publish**, immutable thereafter.

*Why not `<location>-<date>-<shortid>`:* (1) `unlisted` means "reachable only by
direct slug, not listed" — that access model requires the slug to be
**unguessable**; a composite embedding a uuid-derived shortid (uuid v7 is
timestamp-ordered) is enumerable and would make `unlisted` porous. (2) `location`
is a property of the photo set (often empty — ADR-0006 does not seed it; no GPS →
no geocoding), so embedding it in the URL is fragile to later edits. The page and
breadcrumbs show `location_label` / dates from the **live** post, not from the URL.
A readable prefix (`my-trip-<token>`) can be added later without changing the
access model — the token carries the entropy. YAGNI for now.

**Uniqueness** is by construction (token entropy) plus a **defensive `UNIQUE`
index** on `slug` (new — none exists today); no generate-check-retry loop. An
astronomically improbable collision surfaces as an error, not silent reuse.

### D3 — publish/unpublish transitions; `published_at` immutable

- `PublishPost(post_id, user_id, visibility)` — owner-scoped. Requires
  `visibility ∈ {public, unlisted}` (private / unspecified → `INVALID_ARGUMENT` →
  400). Atomic "publish as …": sets `status=published`, `visibility`; generates
  `slug` **iff null**; sets `published_at` **iff null** (→ now). Republish from
  `unpublished` keeps the original slug + `published_at` (stable links, stable
  "first published at").
- `UnpublishPost(post_id, user_id)` — owner-scoped. Sets `status=unpublished`;
  leaves `slug`, `published_at`, `visibility` untouched. The public page 404s.

### D4 — `GetPublicPostBySlug`: the unauth read gate

`GetPublicPostBySlug(slug)` is **not** owner-scoped (no `user_id` in the request).
The repository looks up `WHERE slug = … AND status = 'published' AND visibility IN
('public','unlisted')`; a miss → domain `'post not found'` → gRPC `NOT_FOUND` →
gateway 404 → web `notFound()`. draft / unpublished / private / unknown-slug all
collapse to NOT_FOUND (no distinction leaked). It returns the full post record
including its owner `user_id` (internal — the gateway needs it for
`GetVariantsByIds`) and photos; reuses the existing proto `Post` message (the
gateway's allow-list DTO strips owner/provenance/status fields).

**unlisted vs public** need no distinct handling in 019: both render identically
by slug, and "not in listings" holds automatically because no public listing
endpoint exists. The owner's `ListPosts` stays owner-scoped and shows all their
posts regardless. The only thing making `unlisted` unlisted today is the
unguessable slug (D2) + the absence of a public listing.

### D5 — public route: gateway edge + web SSR

- **Gateway** `GET /v1/public/posts/:slug` — a handler that **does not** call
  `requireSession` (model: `HealthController`). Flow: `getPublicPostBySlug(slug)`
  → `getVariantsByIds(ownerUserId, photoIds)` → assemble a browser DTO via an
  explicit allow-list (`mapPublicPost`): `slug, title, body, locationLabel,
  dateFrom, dateTo, publishedAt`, and `photos: [{ order, caption, variants:
  [{variantType,url,width,height}] }]`. **No** `userId` / `status` / `visibility`
  / `sourceClusterId` / `sourceResultId`. NOT_FOUND → 404.
- **Web** `app/posts/[slug]/page.tsx` — a **server component** OUTSIDE the `(app)`
  route group (inherits only the root `SessionProvider`, never `AuthGuard` /
  `AppShell`). It does a server-side anonymous `fetch` (no cookie) against
  `API_BASE_URL_INTERNAL` (new env, default `http://api-gateway:3001`; the browser
  `NEXT_PUBLIC_API_BASE_URL` is not reachable server-side inside compose). A 404 →
  `notFound()`. Rendered `force-dynamic` / `no-store` because variant URLs are
  presigned with a ~1h TTL (fresh URLs per request; no static caching of expiring
  URLs). Next 15 async `params: Promise<{ slug }>` per the existing pattern.

*Why SSR, not a client component:* the brief mandates SSR, and the public page is
the anchor for future share / og-preview / SEO (020) — a client-only fetch would
need rewriting. The cost is the dual-URL env + a small server fetch helper (none
exists today — all current fetching is client-side, cookie-authed).

### D6 — `post_published` usage event: best-effort AMQP emit

Usage crosses the boundary as a `ConsumptionEvent` protobuf on the `usage.events`
RabbitMQ exchange (emit-not-pull; no ingest RPC exists). publication-service has
**no** messaging infra today, so 019 stands it up by **mirroring photo-service**
(inline per-service; there is no shared messaging package): a `MessagePublisher` /
`RabbitMqBus` (amqplib), a `usage.codec` (protobufjs against
`proto/usage/v1/consumption.proto`), and a `UsageEmitter`; unit tests use an
`InMemoryBus` fake.

Event shape:
```
idempotencyKey: `published:${postId}`     // charge-once → republish never double-counts
userId:         post owner
provider:       USAGE_PROVIDER (local-demo)
occurredAt:     now (ISO)
measurements:   [{ eventType:'post_published', resourceType:'publication',
                   quantity:1, unit:'event',
                   sourceEntityType:'post', sourceEntityId: postId }]
```

**Emit after the publish transaction commits, best-effort:** a broker failure is
logged but does **not** roll back or fail Publish (usage is a side channel; losing
one event is acceptable for the MVP, and redelivery is idempotent via the
charge-once key). No transactional outbox — deliberately consistent with
photo-service. Emitted on the transition into `published` (first publish and
republish); the idempotency key makes it count once.

**The broker must NOT be a boot dependency of publication-service** (unlike
photo-service, which is inherently a `usage.events` *consumer*). photo-service
wires `RABBITMQ_BUS` as an eager async factory whose `RabbitMqBus.create()` retries
then **throws** (`apps/photo-service/src/app.module.ts`,
`src/messaging/rabbitmq-bus.ts`) — copying that verbatim would make `PostDomainService`
(a root provider injecting the emitter) resolve the bus at boot, so a down broker
would crash-loop the whole service and take *every* post RPC offline — including the
public `GetPublicPostBySlug`, which emits nothing. That is a strictly larger blast
radius than the "lose one event" this best-effort design accepts. Therefore:

- **No connect at `bootstrap()`** — the publisher connects **lazily** on first emit.
- **The emit is fire-and-forget** — dispatched after commit and **not awaited** on
  the `PublishPost` request path (the RPC returns on the DB commit; the emit runs
  detached, its promise `.catch()`-guarded and logged). This matters because a lazy
  connect on the request path would otherwise add the adapter's retry latency to the
  RPC. The lazy connect itself must be **bounded** (short timeout / few attempts, NOT
  the adapter's default 15×2s ≈ 30s) so a detached emit against a down broker fails
  fast instead of spinning.
- **Cached connection, no auto-reconnect.** The existing `RabbitMqBus` has no
  reconnect (its own comment: "stops until the process is restarted"); `on('close')`
  only logs. So after a broker drop, subsequent emits are lost until a restart — an
  accepted MVP posture, not something 019 fixes. `UnpublishPost` emits nothing.

### D7 — editor Publish UX

The existing owner editor (`app/(app)/posts/[id]/edit`) gains:
- **Draft / unpublished:** a "Publish" section — visibility choice
  (**Public / Unlisted**, default Public; never Private) + a **Publish** button →
  `PublishPost(visibility)`. On success the component reflects the returned
  published post.
- **Published:** a "Published" panel — `status` + `visibility` + `published_at` +
  the public URL `/posts/<slug>` as a plain `<a>` (no copy button — share is 020) +
  an **Unpublish** button → `UnpublishPost`.
- Visibility on a published post is **read-only**; changing public↔unlisted is
  Unpublish → Publish-with-new-choice (slug / `published_at` immutable, same link).
- No `location_label` / date inputs in 019; the public page renders dates (seeded)
  and `location_label` only when non-empty.

## Components

### proto

- `proto/publication/v1/publication_service.proto`: add RPCs `PublishPost`
  (`PublishPostRequest{ post_id, user_id, PostVisibility visibility }`),
  `UnpublishPost` (`UnpublishPostRequest{ post_id, user_id }`) — both return
  `Post`; `GetPublicPostBySlug` (`GetPublicPostBySlugRequest{ slug }`) returns
  `Post` (owner `user_id` in the message is internal). HTTP annotations for
  documentation; real routing is the Nest gateway.
- `proto/photo/v1/photo_service.proto`: add `GetVariantsByIds`
  (`GetVariantsByIdsRequest{ user_id, repeated string photo_id }`) →
  `GetVariantsByIdsResponse{ repeated PhotoVariantsForId }`,
  `PhotoVariantsForId{ string photo_id, repeated PhotoVariantView variants }`.
  Internal (no HTTP annotation, like `ListPhotoSpacetime`).
- Regenerate via `make proto`; commit the changed `packages/proto-ts` artifacts in
  the same change. **Adding these RPCs *will* change the checked-in generated files**
  (`packages/proto-ts/src/{publication,photo}/v1/*.ts`), and CI's `proto-check`
  git-diffs them — so a *clean* tree after a proto edit means you failed to
  regenerate (stale artifacts → CI red), the opposite of drift-free. The wrinkle:
  `make proto` uses the **remote** BSR plugin (`buf.build/community/stephenh-ts-proto`)
  and can be rate-limited, so regeneration itself (not just the check) may need
  retries. Nothing fails to *compile* locally — all three services use runtime
  `@grpc/proto-loader` + `@GrpcMethod` string handlers and `usage.codec` uses runtime
  protobufjs — so the only failure surface is CI `proto-check` on stale committed
  artifacts. Do not treat local regeneration as optional; retry until it succeeds.

### publication-service

- `db/schema.ts` + new migration `0002_*`: add a `UNIQUE` index on `posts.slug`.
  **Also edit the `migrate-publication` Makefile target** (`Makefile`) to pipe
  `0002` after `0001` — today it lists only `0001`, so a new migration file is
  silently never applied (migrations run manually via `make migrate`, not at boot;
  cf. `migrate-photo`, which lists both). Without this the UNIQUE index D2 leans on
  is absent in dev and in the smoke, and — because the index is purely defensive
  (token entropy carries uniqueness) — everything still goes green, so the miss is
  invisible. Model the target edit on `migrate-photo`.
- `post.types.ts`: `PostPatch` gains `status?`, `slug?`, `publishedAt?`.
- `post.repository.ts`: extend `updateForUser`'s set-builder to carry
  `status`/`slug`/`publishedAt`; add `findBySlugPublic(slug)` (not owner-scoped;
  the published+public/unlisted filter).
- `post.service.ts` (`PostDomainService`): `publishPost(userId, postId,
  visibility)` (validate visibility; generate slug iff null; set published_at iff
  null; persist via `updateForUser`; **emit `post_published` after commit**);
  `unpublishPost(userId, postId)`; `getPublicPostBySlug(slug)`. New domain errors
  map to existing sets (`'post not found'` → NOT_FOUND; a new
  `'cannot publish private'` → INVALID_ARGUMENT).
- `post.grpc.controller.ts`: `PublishPost` / `UnpublishPost` /
  `GetPublicPostBySlug` handlers; map `PostVisibility` in via `PROTO_TO_VISIBILITY`;
  reject private/unspecified on publish.
- New `src/messaging/` (`messaging.port.ts`, `rabbitmq-bus.ts`) + `post/usage.codec.ts`
  + `post/usage.emitter.ts`, adapted from photo-service; DI in `app.module.ts`. The
  publisher provider must be **lazy / non-throwing at boot** (D6) — not a straight
  copy of photo-service's eager `RABBITMQ_BUS` factory. Reads `RABBITMQ_URL` /
  `USAGE_PROVIDER` env.

### photo-service

- `photo.repository.ts`: `findVariantsByIdsForUser(userId, photoIds)` (owner-scoped
  join: photos `WHERE user_id AND id IN (…)`, then their variants).
- `photo.service.ts`: `getVariantsByIds(userId, photoIds)` → per-photo
  `toVariantView` (reuses the existing presigner).
- `photo.grpc.controller.ts`: `GetVariantsByIds` handler.

### api-gateway

- `grpc/publication.client.ts`: add `publishPost`, `unpublishPost`,
  `getPublicPostBySlug`.
- `grpc/photo.client.ts`: add `getVariantsByIds`.
- `http/publication.controller.ts`: `@Post('posts/:postId/publish')` (authed;
  visibility body validated with an **explicit** `private`/unknown → 400 check —
  NOT the `updatePost` pattern, since `VISIBILITY_TO_PROTO` *includes* `private:1`
  and would let it through), `@Post('posts/:postId/unpublish')` (authed); a public
  `@Get('public/posts/:slug')` (no `requireSession`) → `getPublicPostBySlug` →
  `getVariantsByIds` → `mapPublicPost` allow-list DTO; NOT_FOUND → 404; other
  errors propagate as 500 (a photo-service outage must not masquerade as 404).

### web

- `lib/api.ts`: `publishPost(id, visibility)`, `unpublishPost(id)` (client,
  cookie); a **server-side** `getPublicPost(slug)` helper (`API_BASE_URL_INTERNAL`,
  no credentials) + `PublicPost` type.
- `components/posts/PostEditor.tsx`: visibility selector + Publish/Unpublish +
  published panel with the public link (D7). (Opportunistic: switch photo
  resolution to a batch by-ids path if an authed gateway route is added — else
  keep the existing `listPhotos` resolution; `e9g #1` stays open.)
- `app/posts/[slug]/page.tsx`: server component (D5) rendering title / body / date
  range / `location_label` (if set) / photos (variant `<img>` + caption);
  **only** a 404 → `notFound()`; any other non-OK status throws → Next error
  boundary / 500 (a 404 means "no such published post", a 500 means "backend
  problem" — the two must not be conflated). `force-dynamic`. (Known noise: the root
  `SessionProvider` still hydrates on this page and fires an anonymous
  `getCurrentUser` → 401 + a client `console.warn`; harmless, not fixed in 019.)
- `.env.example` + `docker-compose`: `API_BASE_URL_INTERNAL=http://api-gateway:3001`
  on the `web` service; add `RABBITMQ_URL` + `depends_on: rabbitmq` (or its
  healthcheck equivalent) to the `publication-service` block — today it has neither
  and connects only by matching the hardcoded default.

## Testing (RED on skeleton → GREEN)

Per s008/s011/s018: jsdom vitest guards behavior but misses render/integration and
wire-boundary bugs — a **live smoke is mandatory** (dqb; s018 lesson: empty
replace-all 500 slipped past mocks).

- **publication-service (vitest):** publish sets status/slug/publishedAt/visibility;
  slug + published_at immutable on republish; publish private → INVALID_ARGUMENT;
  `getPublicPostBySlug` returns published+public and published+unlisted, NOT_FOUND
  for draft / unpublished / private / unknown slug; unpublish flips status;
  `post_published` emitted once on publish (`InMemoryBus` assert; idempotency key).
- **photo-service (vitest):** `getVariantsByIds` returns variants for the owner's
  ids, omits foreign / non-owned ids, batches.
- **api-gateway (vitest):** publish route rejects private/unknown visibility → 400;
  public route returns a DTO with **no** owner/status/visibility fields; public
  route 404 on NOT_FOUND; unpublish route wired.
- **web (vitest/jsdom):** editor renders Publish + visibility selector and calls
  `publishPost`; published panel shows the `/posts/<slug>` link + Unpublish. **The
  server-component public page still needs a thin `app/posts/[slug]/page.spec.tsx`**
  — `make coverage-gate` runs diff-cover at `--fail-under 100` and *will* score the
  new `page.tsx`'s lines, so "covered by the smoke" is NOT enough (that phrasing
  would walk into a red gate). Follow the s018 precedent
  (`app/(app)/posts/[id]/edit/page.spec.tsx`): `render(await Page({ params:
  Promise.resolve({ slug }) }))` with `getPublicPost` and `next/navigation`'s
  `notFound` `vi.mock`-ed; assert the render for a found post and that a 404 path
  calls `notFound()`. The live smoke is **additional** wire-boundary coverage, not a
  substitute for this unit test.
- **dqb / live smoke:** extend `scripts/smoke-publication.sh` (or a new
  `scripts/smoke-public.sh`; the current smoke is cookie-authed on every curl —
  "logged-out" = simply omit `-b $COOKIE`). Two distinct surfaces, don't conflate:
  - **gateway JSON** `GET :3001/v1/public/posts/<slug>` logged-out → 200 with a DTO
    carrying variant URLs; **fetch one of those variant URLs and assert image bytes**
    (this is the resolvable-variant assertion — the s018 dqb lesson at the wire
    boundary; the server-component render path has no jsdom coverage). Presigned URLs
    are on `MINIO_BROWSER_ENDPOINT`, host-reachable as existing smokes already rely on.
  - **web SSR page** `GET :3000/posts/<slug>` logged-out → 200 HTML (optionally scrape
    an `<img src>`); after unpublish → 404 on both surfaces.

  Then `make gate` + `make coverage-gate` + `make test-guard`; final `/code-review`.

## Order

New branch `session-019-publish-public` from fresh `main`; claim `m71.4`
(opportunistically `e9g #1`). brainstorm doc (this) → **skeleton** commit (proto
delta for publication + photo **+ regenerated `packages/proto-ts` — retry `make
proto` past BSR rate-limits until artifacts actually change**; migration `0002` +
`migrate-publication` Makefile target; gateway public route stub, web public route
stub, messaging skeleton; RED/jsdom tests; `make skeleton-gate` green) → **GREEN**
→ gates + coverage-gate + test-guard + live smoke (publish → logged-out
`/posts/<slug>` + resolvable variant bytes — the dqb boundary) → `/code-review`.
