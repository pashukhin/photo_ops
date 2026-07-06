# Publication editor + cluster→draft bridge — design (session 018)

Date: 2026-07-06 · Status: accepted · Session: 018
Epic: `photo_ops-m71` · Children: `m71.2` (DoD 8), `m71.3` (DoD 10) · Hardening: `4o2`
Method: exSDD / skeleton-first (`docs/agent-workflow-evolution.md` Decision 1).
Builds on: 017 (`docs/superpowers/specs/2026-07-05-publication-foundation-design.md`,
`docs/adr/0006-publication-from-cluster.md`).

## Goal

The first publication UI: from a ready cluster node a user creates a draft post
and edits it (title, body, per-photo caption, photo order), then saves. This is
the foundation session 019 builds publish + the public page on. One thin vertical
slice: **button in `ClusterView` → `CreatePostFromCluster` → land in a working
editor → edit → save via `UpdatePost`.**

The affordance alone would route to a non-existent editor (a dead end), so the
bridge (`m71.2`) and the editor (`m71.3`) ship together. The `4o2` hardening is a
blocker for the editor's update path and rides along.

## Scope

In: create-post affordance on selectable cluster nodes; `/posts/[id]/edit` route +
editor (title/body/caption/order/remove); `post_photos` mutation (replace-all);
`4o2` input validation + node-selection guards.

Out (later sessions): publish / slug / `published_at` / visibility UI / public
`/posts/[slug]` page (019); share / copy-link (020); map rendering; markdown
(§3.6 — body stays plain); adding photos NOT already in the post (no photo-picker
UI); drag-reorder (additive follow-up — 018 ships keyboard ↑/↓); a posts-list page.

## Decisions

### D1 — `post_photos` mutation is replace-all on `UpdatePost`

`UpdatePost` accepts the **full** photo list; the editor already holds the whole
post (from `GetPost`), so one idempotent PATCH carries reorder + caption + remove.
*Rejected:* discrete RPCs (`ReorderPhotos`/`SetCaption`/`RemovePhoto`/`AddPhoto`) —
more proto surface, more endpoints, more tests, for an editor that mutates a copy
it holds in memory.

proto3 has no `optional repeated`, and title-only PATCH must **not** touch photos
(distinct from "replace with empty"), so photos travel in a wrapper message whose
presence is meaningful:

```proto
message PostPhotoInput { string photo_id = 1; string caption = 2; }  // no order
message PostPhotoList  { repeated PostPhotoInput photos = 1; }
// UpdatePostRequest gains:
optional PostPhotoList photos = 10;   // present → replace-all; absent → leave photos untouched
```

- **`order` is canonicalized server-side** from array position (0..n-1); the
  client sends order only implicitly, as list order. No client-supplied order → no
  drift.
- **Membership guard:** the new list must be a **non-empty subset** of the post's
  current `photo_id`s, with no duplicates. Empty / superset (injecting a photo not
  in the post) / duplicate → rejected. This keeps `add-photo` out of 018 and stops
  a caller attaching photos it may not own. The guard reads the current post, so it
  lives in the domain service (`updatePost`), not the gateway edge.
- **Persistence:** `PostRepository.updateForUser` applies the photo replace as
  delete-all-then-insert of `post_photos` **inside the existing update
  transaction**. A flat, deduped input list means `4o2 #5` (collectPhotos dedup) is
  moot for this path.

### D2 — the editor resolves photo URLs client-side, like `ClusterView`

`PostPhoto` stores only `photo_id`. The editor fetches the user's ready photos once
(`listPhotos({status:['ready'], pageSize:500})`) into an `id → PhotoAsset` map and
renders each photo as its `thumbnail`/`preview` **variant** URL, falling back to the
id when unresolved (unready / beyond the cap) — the exact pattern
`ClusterView`/`TreeNodeView` already use (`photo_ops-hec`).

*Why:* zero new backend; variants are prepared derivatives, never originals, so
§4.4 ("originals are private; public delivery uses prepared variants") is honored
even though this is a private owner view. *Rejected:* a new gateway
`photo_ids → URLs` endpoint, or extending `GetPost` so `publication-service` calls
`photo-service` — more cross-service coupling and backend work, breaking the thin
slice for no 018 benefit.

### D3 — only meaningful nodes are postable (closes `4o2 #3`)

Cluster node kinds: `ROOT`, `INTERNAL`, `LEAF`, `NOT_CLUSTERABLE`, `SEGMENT`.

- **UI:** the "Create post" button renders only on `LEAF` / `INTERNAL` / `SEGMENT`
  nodes with `photoCount > 0` (a post from a cluster of any level — ADR-0005 — but
  not the whole-library root or the excluded-photos bucket).
- **Backend guard (create path):** reject `ROOT` (snapshots the whole tree incl.
  the `not_clusterable` bucket), `NOT_CLUSTERABLE`, and any node whose collected
  subtree is empty → `INVALID_ARGUMENT` → HTTP 400. Defense in depth behind the UI.

### D4 — explicit Save, no autosave

A single "Save" button PATCHes title + body + the photos list; a dirty-state
indicator shows unsaved changes. *Why:* simpler, deterministically testable, maps
one-to-one onto `UpdatePost`. Optimistic UI is minimal — after save, the component
reflects the server's returned post. *Rejected:* autosave (debounce complexity,
chattier writes) for a first editor.

### D5 — `4o2` input validation at the edge

- **Visibility (`4o2 #1`):** an unknown visibility string currently maps to
  `undefined` and is silently dropped (a privacy-relevant 200-no-op). Whitelist
  `private|unlisted|public` at the gateway → else **400**.
- **Dates (`4o2 #2`):** an invalid/non-ISO `date_from`/`date_to` becomes
  `Invalid Date` and reaches Drizzle (500 / corrupt row). Validate parseability at
  the gateway → else **400**. Semantics stay **ISO instant** (the proto comment and
  the cluster-seeded values); `""` clears.
- **DTO shaping (`4o2 #4`):** `mapPost`/`mapSummary` build an explicit browser DTO
  instead of `...raw` spread (matches the cluster/photo controllers; stops future
  proto fields auto-leaking). `sourceClusterId`/`sourceResultId` stay exposed —
  smoke asserts them and they are intentional provenance.

## Components

### proto (`proto/publication/v1/publication_service.proto`)

Adds `PostPhotoInput`, `PostPhotoList`, and `optional PostPhotoList photos = 10` on
`UpdatePostRequest`. Regenerate loaders (`make proto`). No new RPC.

### publication-service

- `PostPatch` gains `photos?: { photoId: string; caption: string }[]` (present ⇒
  replace-all).
- `PostDomainService.updatePost`: when `patch.photos` is present, read the current
  post, validate the membership guard (non-empty subset, no dup) — else throw a
  domain error mapped to `INVALID_ARGUMENT` (400); canonicalize order from list
  position; pass the rebuilt photo rows to the repository.
- `PostDomainService.createPostFromCluster`: add the node-kind + empty-subtree guard
  (D3) → `INVALID_ARGUMENT`.
- `PostRepository.updateForUser`: within its transaction, when photos are supplied,
  delete existing `post_photos` for the post and insert the new ordered rows.
- `PublicationGrpcController`: map the new `photos` wrapper (present-or-absent) into
  `PostPatch`; map the new domain errors (`'invalid photo membership'`,
  `'node not selectable'`, `'empty node'`) to `INVALID_ARGUMENT`.

### api-gateway

- `PublicationController.updatePost`: validate visibility (whitelist → 400) and
  dates (ISO-parseable → 400) before building `UpdatePostInput`; forward a supplied
  `photos` list (as `{photoId, caption}[]`) into the wrapper.
- `mapPost`/`mapSummary`: explicit DTO (D5).
- `UpdatePostBody` gains `photos?: { photoId: string; caption: string }[]`.

### web

- `lib/api.ts`: `createPost({resultId,nodeId,title?})`, `getPost(id)`,
  `updatePost(id, patch)` + `Post` / `PostPhoto` types.
- `components/clusters/ClusterView.tsx` / `TreeNodeView`: thread `resultId`
  (`active.id`) into the tree; render a "Create post" button on selectable nodes
  (D3); click → `createPost` → `router.push('/posts/${id}/edit')`.
- `app/(app)/posts/[id]/edit/page.tsx` + `components/posts/PostEditor.tsx`: load
  `getPost`; resolve photo variants (D2); edit title (input), body (textarea,
  plain), per-photo caption (input) + order (↑/↓ buttons) + remove; explicit Save →
  `updatePost`; dirty indicator; a 404 (other/absent post) surfaces a message.

## Testing (RED on skeleton → GREEN)

Per s008/s011: jsdom vitest guards behavior but misses render/integration bugs — a
live `make smoke-ui` is mandatory (dqb).

- **web (vitest/jsdom):** affordance calls `createPost` with `nodeId`+`resultId`
  and routes to the editor; no button on `ROOT`/`NOT_CLUSTERABLE`/empty nodes.
  Editor: title/body edit PATCHes; caption persists per `PostPhoto`; ↑/↓ changes
  order; remove drops a photo; a 404 renders a message.
- **publication-service (vitest):** replace-all reorder/caption/remove persists;
  membership guard (empty / superset / duplicate) → error; node guard
  (`ROOT`/`NOT_CLUSTERABLE`/empty) → error; **title-only PATCH preserves photos +
  seeded dates** (`4o2 #6`).
- **api-gateway (vitest):** bad visibility → 400; non-ISO date → 400.
- **dqb / live:** `make smoke-ui` — create-from-node → editor renders variant
  thumbnails → edit + save round-trips. Extend `scripts/smoke-publication.sh` for
  `4o2 #6` (title-only PATCH keeps photos + dates). Then `make gate` +
  `make coverage-gate` + `make test-guard`; final `/code-review`.

## Order

New branch `session-018-publication-editor` from fresh `main`; claim
`m71.2`/`m71.3`/`4o2`. skeleton (proto delta + stubs + RED, `make skeleton-gate`
green) → GREEN → gates + smoke → review.
