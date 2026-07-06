# Publication editor + cluster→draft bridge — Skeleton Commit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to fill this skeleton task-by-task — each task makes its RED tests green within the provided stubs. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From a ready cluster node a user creates a draft post and edits it (title, body, per-photo caption, photo order, remove), then saves — the first publication UI.

**Architecture / WHY:** Thin vertical slice: a "Create post" affordance on selectable `ClusterView` nodes → `CreatePostFromCluster` → `/posts/[id]/edit` editor → replace-all `UpdatePost`. `post_photos` mutation is replace-all on `UpdatePost` (wrapper message for proto3 presence; order canonicalized from list position; membership guarded to a non-empty subset of the post's snapshot). The editor resolves photo URLs client-side via `listPhotos→variant` (like `ClusterView`) — zero new backend. `4o2` hardens the update/create edge (visibility/date validation, node-selection guard, explicit DTO). Entry points: contract → `proto/publication/v1/publication_service.proto`; domain → `apps/publication-service/src/post/post.service.ts`; edge → `apps/api-gateway/src/http/publication.controller.ts`; UI → `apps/web/components/posts/PostEditor.tsx` + `components/clusters/ClusterView.tsx`; behavior → the `*.spec.ts(x)` files below + `scripts/smoke-publication.sh` + `apps/web/smoke/`. Design: `docs/superpowers/specs/2026-07-06-publication-editor-design.md`.

**Tech Stack:** proto3 + `@grpc/proto-loader`; NestJS (publication-service gRPC, api-gateway HTTP) + Drizzle/Postgres; Next.js + React + Tailwind, vitest + `@testing-library/react` (jsdom); bash+curl smoke; Playwright smoke-ui.

## Global Constraints

- `web` talks only to `api-gateway` (except presigned MinIO); no direct photo/publication service calls. Photo URLs come from `listPhotos` variants (owner-scoped presigned), never originals (§4.4).
- `userId` is always caller-supplied from the validated session in `api-gateway`; never from the request body. Every read/update is owner-scoped.
- Sync contracts are proto-first: after editing `.proto`, run `make proto`; `make proto-check` must stay clean.
- Body is plain text — no markdown (§3.6).
- `order` is canonicalized server-side from array position (0..n-1); clients never send explicit order numbers.
- Post-photo mutation is **replace-all**: the new list must be a **non-empty subset** of the post's current `photo_id`s, no duplicates.

## Non-Goals

- No `add-photo` (attaching a photo not already in the post — no picker UI); replace-all only removes/reorders/re-captions.
- No drag-reorder — keyboard ↑/↓ buttons only (drag is an additive follow-up).
- No publish / slug / `published_at` / visibility UI / public `/posts/[slug]` page (019); no share (020); no map; no posts-list page.
- No autosave — explicit Save.
- No new gateway endpoint or `GetPost` extension for photo URLs (rejected in the spec — client-side resolution).

---

### Task 1: proto contract — replace-all photos on `UpdatePost`

**Files:**
- Modify: `proto/publication/v1/publication_service.proto` (add `PostPhotoInput`, `PostPhotoList`, `optional PostPhotoList photos = 10` on `UpdatePostRequest`)
- Regen (generated, committed): whatever `make proto` writes under `packages/proto-ts` / service `photoops_proto` dirs.

**Interfaces:**
- Produces: proto message `PostPhotoInput { string photo_id = 1; string caption = 2; }`, `PostPhotoList { repeated PostPhotoInput photos = 1; }`, and `UpdatePostRequest.photos` (field 10, `optional PostPhotoList`). Present ⇒ replace-all; absent ⇒ photos untouched. No `order` field — order is list position.

**GREEN obligation (for the implementer):** none beyond regen — this task IS the contract diff.

- [ ] **Step 1: Edit the proto**

Add to `proto/publication/v1/publication_service.proto`:

```proto
// A photo in a replace-all UpdatePost photos list. No order field — the list
// position IS the order (canonicalized server-side). photo_id must already be a
// member of the post (replace-all removes/reorders/re-captions; never adds).
message PostPhotoInput {
  string photo_id = 1;
  string caption = 2;
}

message PostPhotoList {
  repeated PostPhotoInput photos = 1;
}
```

And in `UpdatePostRequest`, after `date_to = 9`:

```proto
  // Replace-all post_photos. Present -> the post's photos become exactly this
  // list (order = position); absent -> photos untouched (e.g. a title-only PATCH).
  optional PostPhotoList photos = 10;
```

Update the `UpdatePost` rpc doc comment: `post_photos mutation lands in session 018` → `post_photos replace-all via the photos field (session 018)`.

- [ ] **Step 2: Regenerate + verify contract clean**

Run: `make proto` then `make proto-check`
Expected: regen succeeds; `proto-check` exits 0 (generated artifacts committed match).

- [ ] **Step 3: Typecheck**

Run: `make typecheck`
Expected: passes (no consumer references the new field yet).

- [ ] **Step 4: Commit**

```bash
git add proto/ packages/proto-ts apps/*/src/photoops_proto 2>/dev/null; git add -A
git commit -m "skeleton(018): proto — replace-all photos on UpdatePost (T1)"
```

---

### Task 2: publication-service domain — replace-all guard + node-selection guard

**Files:**
- Modify: `apps/publication-service/src/post/post.types.ts` (add `PostPhotoInput`; `PostPatch.photos?`)
- Modify: `apps/publication-service/src/post/post.service.ts` (`updatePost` membership guard; `createPostFromCluster` node-kind + empty guard)
- Test: `apps/publication-service/src/post/post.service.spec.ts` (extend — RED)

**Interfaces:**
- Consumes: `PostRepositoryPort.findByIdForUser` / `.updateForUser` (existing), `ClusterReaderPort.getResult` (existing). Cluster node kinds (numeric, from proto): ROOT=1, INTERNAL=2, LEAF=3, NOT_CLUSTERABLE=4, SEGMENT=5.
- Produces: `PostPhotoInput = { photoId: string; caption: string }`; `PostPatch.photos?: PostPhotoInput[]` (present ⇒ replace-all). Domain error messages: `'invalid photo membership'`, `'node not selectable'`, `'empty node'`.

**GREEN obligation (for the implementer):** In `updatePost`, when `patch.photos` is present: read the current post (owner-scoped `findByIdForUser`; null ⇒ `'post not found'`), then reject unless the list is non-empty, duplicate-free, and every `photoId` is a current member ⇒ `'invalid photo membership'`; otherwise apply via `updateForUser`. In `createPostFromCluster`, after locating the node: reject ROOT(1)/NOT_CLUSTERABLE(4) ⇒ `'node not selectable'`, and an empty collected subtree ⇒ `'empty node'`. Make the RED tests below pass; you may add narrower tests; you may not weaken/rename these.

- [ ] **Step 1: Write the RED tests** (append to `post.service.spec.ts`)

```ts
describe('PostDomainService.updatePost replace-all photos', () => {
  it('applies a valid subset: reads current membership, then updates', async () => {
    // why: replace-all must validate against the post's snapshot before writing —
    // so it reads the current post first, then delegates the write.
    const current = makePostRecord(); // photos p1,p2,p3
    const updated = makePostRecord({ photos: [{ photoId: 'p2', order: 0, caption: 'hi' }] });
    const findByIdForUser = vi.fn().mockResolvedValue(current);
    const updateForUser = vi.fn().mockResolvedValue(updated);
    const { service } = createService({ repository: { findByIdForUser, updateForUser } });

    const result = await service.updatePost('user-1', 'post-1', {
      photos: [{ photoId: 'p2', caption: 'hi' }]
    });

    expect(findByIdForUser).toHaveBeenCalledWith('user-1', 'post-1');
    expect(updateForUser).toHaveBeenCalledWith('user-1', 'post-1', {
      photos: [{ photoId: 'p2', caption: 'hi' }]
    });
    expect(result).toBe(updated);
  });

  it('rejects an empty photos list', async () => {
    // why: a post with zero photos is meaningless (matches the create guard).
    const { service } = createService({
      repository: { findByIdForUser: vi.fn().mockResolvedValue(makePostRecord()) }
    });
    await expect(service.updatePost('user-1', 'post-1', { photos: [] }))
      .rejects.toThrow('invalid photo membership');
  });

  it('rejects a photo not in the post (no add via replace-all)', async () => {
    // why: replace-all removes/reorders/re-captions only — it cannot attach a
    // photo the post never snapshotted (which the caller may not even own).
    const { service } = createService({
      repository: { findByIdForUser: vi.fn().mockResolvedValue(makePostRecord()) }
    });
    await expect(
      service.updatePost('user-1', 'post-1', { photos: [{ photoId: 'p1', caption: '' }, { photoId: 'p9', caption: '' }] })
    ).rejects.toThrow('invalid photo membership');
  });

  it('rejects a duplicate photo id', async () => {
    // why: post_photos PK is (post_id, photo_id) — a dup would corrupt the write.
    const { service } = createService({
      repository: { findByIdForUser: vi.fn().mockResolvedValue(makePostRecord()) }
    });
    await expect(
      service.updatePost('user-1', 'post-1', { photos: [{ photoId: 'p1', caption: '' }, { photoId: 'p1', caption: 'x' }] })
    ).rejects.toThrow('invalid photo membership');
  });

  it('rejects when the post is absent or not owned', async () => {
    // why: the membership read is owner-scoped; a foreign/missing post → not found.
    const { service } = createService({
      repository: { findByIdForUser: vi.fn().mockResolvedValue(null) }
    });
    await expect(service.updatePost('user-1', 'ghost', { photos: [{ photoId: 'p1', caption: '' }] }))
      .rejects.toThrow('post not found');
  });

  it('title-only patch does not read membership and leaves photos untouched', async () => {
    // why: 4o2 #6 — a scalar-only PATCH must not touch post_photos, so it must
    // not even do the membership read.
    const findByIdForUser = vi.fn();
    const updateForUser = vi.fn().mockResolvedValue(makePostRecord({ title: 'New' }));
    const { service } = createService({ repository: { findByIdForUser, updateForUser } });

    await service.updatePost('user-1', 'post-1', { title: 'New' });

    expect(findByIdForUser).not.toHaveBeenCalled();
    expect(updateForUser).toHaveBeenCalledWith('user-1', 'post-1', { title: 'New' });
  });
});

describe('PostDomainService.createPostFromCluster node-selection guard', () => {
  it('rejects the ROOT node (would snapshot the whole tree incl. not_clusterable)', async () => {
    // why: 4o2 #3 — posting root publishes the entire library, not an episode.
    const { service } = createService({
      clusters: { getResult: vi.fn().mockResolvedValue(makeTree()) } // root id='root', kind 1
    });
    await expect(
      service.createPostFromCluster({ userId: 'user-1', resultId: 'result-1', nodeId: 'root', title: '' })
    ).rejects.toThrow('node not selectable');
  });

  it('rejects a NOT_CLUSTERABLE node', async () => {
    // why: the excluded-photos bucket is not a story.
    const tree = makeTree();
    tree.root!.children.push({ id: 'nc', kind: 4, dateFrom: '', dateTo: '', items: [{ photoId: 'x' }], children: [] });
    const { service } = createService({ clusters: { getResult: vi.fn().mockResolvedValue(tree) } });
    await expect(
      service.createPostFromCluster({ userId: 'user-1', resultId: 'result-1', nodeId: 'nc', title: '' })
    ).rejects.toThrow('node not selectable');
  });

  it('rejects a selectable node whose subtree has no photos', async () => {
    // why: 4o2 #3 — an empty node yields a silently-empty 0-photo post.
    const tree = makeTree();
    tree.root!.children.push({ id: 'empty', kind: 3, dateFrom: '', dateTo: '', items: [], children: [] });
    const { service } = createService({ clusters: { getResult: vi.fn().mockResolvedValue(tree) } });
    await expect(
      service.createPostFromCluster({ userId: 'user-1', resultId: 'result-1', nodeId: 'empty', title: '' })
    ).rejects.toThrow('empty node');
  });
});
```

- [ ] **Step 2: Run the tests — confirm RED**

Run: `pnpm --filter @photoops/publication-service test -- post.service`
Expected: the new tests FAIL (updatePost passes photos through with no guard / no membership read; createPostFromCluster snapshots root & empty nodes). Existing tests still pass. Failures are on assertions/thrown-message, not missing symbols.

- [ ] **Step 3: Add the signature surface (types), leave behavior unimplemented**

In `post.types.ts`:

```ts
// A photo in a replace-all UpdatePost list; order = list position (assigned by
// the repository). photo_id must already be a member of the post.
export interface PostPhotoInput {
  photoId: string;
  caption: string;
}
```

and add to `PostPatch`:

```ts
  photos?: PostPhotoInput[]; // present ⇒ replace-all (session 018)
```

Leave `post.service.ts` `updatePost` / `createPostFromCluster` bodies AS-IS (guards unimplemented — this is the RED). Do not add the guard logic here; that is the implementer's GREEN.

- [ ] **Step 4: Confirm still RED + typecheck**

Run: `pnpm --filter @photoops/publication-service test -- post.service` (Expected: same behavior FAILs, symbols resolve) and `make typecheck` (Expected: clean).

- [ ] **Step 5: Commit**

```bash
git add apps/publication-service/src/post/post.types.ts apps/publication-service/src/post/post.service.ts apps/publication-service/src/post/post.service.spec.ts
git commit -m "skeleton(018): publication domain — replace-all + node guards RED (T2)"
```

---

### Task 3: publication-service edge — gRPC mapping + repository replace

**Files:**
- Modify: `apps/publication-service/src/post/post.grpc.controller.ts` (map `photos` wrapper → `PostPatch.photos`; new errors → `INVALID_ARGUMENT`)
- Modify: `apps/publication-service/src/post/post.repository.ts` (`updateForUser`: replace `post_photos` when `patch.photos` present)
- Test: `apps/publication-service/src/post/post.grpc.controller.spec.ts` (RED)

**Interfaces:**
- Consumes: `PostPatch.photos` (T2); domain error messages `'invalid photo membership'` / `'node not selectable'` / `'empty node'`.
- Produces: gRPC `UpdatePost` accepts `photos?: { photos: { photoId: string; caption: string }[] }`; repository replace-all writes `post_photos` rows with `order = array index` inside the update transaction.

**GREEN obligation (for the implementer):** In the gRPC controller, map a present `request.photos` (wrapper) into `patch.photos = request.photos.photos.map(p => ({ photoId: p.photoId, caption: p.caption }))`; extend `mapDomainError` so the three new messages map to `INVALID_ARGUMENT`. In `post.repository.ts` `updateForUser`, when `patch.photos` is present, within the existing transaction delete the post's `post_photos` and insert the new rows with `order` = index; return the record with the new photos. (Repo is IO — excluded from unit coverage; verified by smoke in T8.)

- [ ] **Step 1: Write the RED tests** (extend `post.grpc.controller.spec.ts` — mirror its existing harness that fakes `PostDomainService`)

```ts
it('UpdatePost maps a present photos wrapper into PostPatch.photos', async () => {
  // why: proto3 optional message → the domain receives a flat {photoId,caption}[]
  // (order is list position); title stays a normal scalar field.
  const updatePost = vi.fn().mockResolvedValue(makeRecord());
  const controller = makeController({ updatePost });

  await controller.updatePost({
    postId: 'post-1', userId: 'user-1', title: 'T',
    photos: { photos: [{ photoId: 'p2', caption: 'hi' }, { photoId: 'p1', caption: '' }] }
  });

  expect(updatePost).toHaveBeenCalledWith('user-1', 'post-1', {
    title: 'T',
    photos: [{ photoId: 'p2', caption: 'hi' }, { photoId: 'p1', caption: '' }]
  });
});

it('UpdatePost with no photos wrapper does not set patch.photos', async () => {
  // why: a title-only PATCH must leave photos untouched (no empty replace).
  const updatePost = vi.fn().mockResolvedValue(makeRecord());
  const controller = makeController({ updatePost });
  await controller.updatePost({ postId: 'post-1', userId: 'user-1', title: 'T' });
  expect(updatePost).toHaveBeenCalledWith('user-1', 'post-1', { title: 'T' });
});

it.each(['invalid photo membership', 'node not selectable', 'empty node'])(
  'maps domain error %s to INVALID_ARGUMENT', async (message) => {
    // why: bad-input domain errors must surface as 400, not 500.
    const controller = makeController({ updatePost: vi.fn().mockRejectedValue(new Error(message)) });
    await expect(
      controller.updatePost({ postId: 'p', userId: 'u', photos: { photos: [{ photoId: 'p1', caption: '' }] } })
    ).rejects.toMatchObject({ code: status.INVALID_ARGUMENT });
  }
);
```

> If the existing spec has no `makeController`/`makeRecord` helper, add minimal ones mirroring `post.service.spec.ts` (a fake `PostDomainService` with `vi.fn()` methods; a `makeRecord` like `makePostRecord`). `status` from `@grpc/grpc-js`.

- [ ] **Step 2: Run — confirm RED**

Run: `pnpm --filter @photoops/publication-service test -- post.grpc.controller`
Expected: FAIL — controller drops `photos` (not in `toPatch`) and the three messages don't map to `INVALID_ARGUMENT`.

- [ ] **Step 3: Add signature surface, leave behavior unimplemented**

Extend the controller's `updatePost` request type with `photos?: { photos: { photoId: string; caption: string }[] }` and `toPatch` input type accordingly (so the test typechecks). Do NOT implement the mapping/error extension or the repo replace — leave `toPatch` ignoring `photos` and `mapDomainError` unchanged (RED). In `post.repository.ts`, no behavior change yet (its replace is IO, smoke-verified — but keep it compiling with the new `PostPatch.photos` type; a passthrough that ignores `patch.photos` is the RED stub for the smoke path).

- [ ] **Step 4: Confirm still RED + typecheck**

Run: `pnpm --filter @photoops/publication-service test -- post.grpc.controller` (FAIL on behavior) and `make typecheck` (clean).

- [ ] **Step 5: Commit**

```bash
git add apps/publication-service/src/post/post.grpc.controller.ts apps/publication-service/src/post/post.grpc.controller.spec.ts apps/publication-service/src/post/post.repository.ts
git commit -m "skeleton(018): publication edge — photos wrapper + error mapping RED (T3)"
```

---

### Task 4: api-gateway — visibility/date validation, photos passthrough, explicit DTO

**Files:**
- Modify: `apps/api-gateway/src/http/publication.controller.ts` (validate visibility + dates → 400; forward `photos`; explicit `mapPost`/`mapSummary` DTO)
- Modify: `apps/api-gateway/src/grpc/publication.client.ts` (`UpdatePostInput.photos?`; wrap into the gRPC `photos` message)
- Test: `apps/api-gateway/src/http/publication.controller.spec.ts` (RED)

**Interfaces:**
- Consumes: gRPC `UpdatePost` `photos` wrapper (T3), `PublicationClient.updatePost`.
- Produces: `UpdatePostBody.photos?: { photoId: string; caption: string }[]`; `UpdatePostInput.photos?: { photoId: string; caption: string }[]`; the client sends `photos: input.photos ? { photos: input.photos } : undefined`. `mapPost` returns an explicit browser DTO (enumerated fields, `status`/`visibility` as strings), no `...raw` spread.

**GREEN obligation (for the implementer):** In `updatePost`: reject a `visibility` not in `{private,unlisted,public}` with `BadRequestException` (400); reject a `dateFrom`/`dateTo` that is present, non-empty, and not a valid ISO instant (`Number.isNaN(Date.parse(v))`) with `BadRequestException`; forward `body.photos` into `input.photos`. Replace `mapPost`/`mapSummary` `...raw` spread with an explicit DTO. In `publication.client.ts`, add `photos` to `UpdatePostInput` and wrap it into the gRPC `{ photos: { photos } }` message.

- [ ] **Step 1: Write the RED tests** (append to `publication.controller.spec.ts`)

```ts
it('updatePost: rejects an unknown visibility with 400', async () => {
  // why: 4o2 #1 — a typo'd visibility must not be a silent 200 no-op (privacy).
  const { controller } = createController();
  await expect(
    controller.updatePost('photoops_session=s', 'post-1', { visibility: 'pubic' })
  ).rejects.toBeInstanceOf(BadRequestException);
});

it('updatePost: rejects a non-ISO date with 400', async () => {
  // why: 4o2 #2 — an invalid date must not reach Drizzle (500 / corrupt row).
  const { controller } = createController();
  await expect(
    controller.updatePost('photoops_session=s', 'post-1', { dateFrom: 'last summer' })
  ).rejects.toBeInstanceOf(BadRequestException);
});

it('updatePost: forwards a photos replace-all list to the client wrapper input', async () => {
  // why: the editor's Save carries the reordered/re-captioned list.
  const { controller, publicationClient } = createController();
  vi.mocked(publicationClient.updatePost).mockResolvedValue(makePostRaw());
  await controller.updatePost('photoops_session=s', 'post-1', {
    photos: [{ photoId: 'p2', caption: 'hi' }, { photoId: 'p1', caption: '' }]
  });
  expect(publicationClient.updatePost).toHaveBeenCalledWith({
    userId: 'user-1', postId: 'post-1',
    photos: [{ photoId: 'p2', caption: 'hi' }, { photoId: 'p1', caption: '' }]
  });
});

it('mapPost: returns an explicit DTO without leaking unmapped raw fields', async () => {
  // why: 4o2 #4 — shape a browser DTO, do not spread ...raw. sourceCluster/Result
  // stay (intentional provenance); a stray proto field must not auto-appear.
  const { controller, publicationClient } = createController();
  vi.mocked(publicationClient.getPost).mockResolvedValue(
    makePostRaw({ ...({ leakedField: 'x' } as object) }) as PostRaw
  );
  const result = (await controller.getPost('photoops_session=s', 'post-1')) as Record<string, unknown>;
  expect(result).not.toHaveProperty('leakedField');
  expect(result.sourceClusterId).toBe('node-A');
  expect(result.status).toBe('draft');
  expect(result.photos).toEqual([{ photoId: 'p1', order: 0, caption: '' }]);
});
```

> Import `BadRequestException` from `@nestjs/common`.

- [ ] **Step 2: Run — confirm RED**

Run: `pnpm --filter @photoops/api-gateway test -- publication.controller`
Expected: FAIL — no visibility/date validation (bad values silently mapped/passed), `photos` not forwarded, `mapPost` spreads `...raw` (leaks `leakedField`).

- [ ] **Step 3: Add signature surface, leave behavior unimplemented**

Add `photos?: { photoId: string; caption: string }[]` to `UpdatePostBody` and `UpdatePostInput`; keep the controller/client bodies otherwise unchanged (validation + forwarding + DTO unimplemented → RED). Keep it typechecking.

- [ ] **Step 4: Confirm still RED + typecheck**

Run: `pnpm --filter @photoops/api-gateway test -- publication.controller` (FAIL on behavior) and `make typecheck`.

- [ ] **Step 5: Commit**

```bash
git add apps/api-gateway/src/http/publication.controller.ts apps/api-gateway/src/http/publication.controller.spec.ts apps/api-gateway/src/grpc/publication.client.ts
git commit -m "skeleton(018): gateway — visibility/date 400 + photos + DTO RED (T4)"
```

---

### Task 5: web lib/api — createPost / getPost / updatePost + types

**Files:**
- Modify: `apps/web/lib/api.ts` (add `Post`/`PostPhoto` types + `createPost`/`getPost`/`updatePost`)
- Test: `apps/web/lib/api.spec.ts` (RED)

**Interfaces:**
- Produces:
  ```ts
  export interface PostPhoto { photoId: string; order: number; caption: string }
  export interface Post {
    id: string; userId: string; sourceClusterId: string; sourceResultId: string;
    title: string; body: string; status: string; visibility: string; slug: string;
    locationLabel: string; dateFrom: string; dateTo: string; mapEnabled: boolean;
    publishedAt: string; createdAt: string; updatedAt: string; photos: PostPhoto[];
  }
  export interface UpdatePostPatch {
    title?: string; body?: string;
    photos?: { photoId: string; caption: string }[];
  }
  export function createPost(input: { resultId: string; nodeId: string; title?: string }): Promise<Post>;
  export function getPost(postId: string): Promise<Post>;
  export function updatePost(postId: string, patch: UpdatePostPatch): Promise<Post>;
  ```

**GREEN obligation (for the implementer):** implement the three calls against `api-gateway` (`credentials: 'include'`, `readErrorMessage` on `!ok`): `createPost` → `POST /v1/posts` with `{resultId,nodeId,title?}`; `getPost` → `GET /v1/posts/:id`; `updatePost` → `PATCH /v1/posts/:id` with the patch JSON. Follow the existing `fetch` shape in this file.

- [ ] **Step 1: Write the RED tests** (append to `api.spec.ts`, mirroring its existing `fetch`-mock pattern)

```ts
describe('publication api', () => {
  it('createPost POSTs the cluster ref and returns the post', async () => {
    const post = { id: 'post-1', photos: [] };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => post });
    vi.stubGlobal('fetch', fetchMock);
    const result = await createPost({ resultId: 'r1', nodeId: 'n1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/v1/posts');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ resultId: 'r1', nodeId: 'n1' });
    expect(result).toEqual(post);
  });

  it('getPost GETs the post by id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'post-1', photos: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    await getPost('post-1');
    expect(fetchMock.mock.calls[0][0]).toContain('/v1/posts/post-1');
  });

  it('updatePost PATCHes title + photos', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'post-1', photos: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    await updatePost('post-1', { title: 'T', photos: [{ photoId: 'p1', caption: 'c' }] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/v1/posts/post-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ title: 'T', photos: [{ photoId: 'p1', caption: 'c' }] });
  });

  it('updatePost throws the gateway message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400, clone: () => ({ json: async () => ({ message: 'bad visibility' }) })
    }));
    await expect(updatePost('post-1', { title: 'x' })).rejects.toThrow('bad visibility');
  });
});
```

> Match the import + `fetch` stubbing already used in `api.spec.ts` (adapt the failure-mock shape to that file's `readErrorMessage` expectations if it differs).

- [ ] **Step 2: Run — confirm RED**

Run: `pnpm --filter web test -- api.spec`
Expected: FAIL — `createPost`/`getPost`/`updatePost` are not exported.

- [ ] **Step 3: Add the stub signatures**

```ts
export async function createPost(_input: { resultId: string; nodeId: string; title?: string }): Promise<Post> {
  throw new Error('not implemented'); // GREEN is the implementer's job
}
export async function getPost(_postId: string): Promise<Post> {
  throw new Error('not implemented');
}
export async function updatePost(_postId: string, _patch: UpdatePostPatch): Promise<Post> {
  throw new Error('not implemented');
}
```

(plus the `Post`/`PostPhoto`/`UpdatePostPatch` type exports)

- [ ] **Step 4: Confirm still RED + typecheck**

Run: `pnpm --filter web test -- api.spec` (FAIL on behavior, symbols resolve) and `make typecheck`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/api.ts apps/web/lib/api.spec.ts
git commit -m "skeleton(018): web api — createPost/getPost/updatePost RED (T5)"
```

---

### Task 6: web ClusterView — "Create post" affordance

**Files:**
- Modify: `apps/web/components/clusters/ClusterView.tsx` (`TreeNodeView` gets a "Create post" button on selectable nodes; thread `resultId`; on click `createPost` → `router.push`)
- Test: `apps/web/components/clusters/ClusterView.spec.tsx` (RED)

**Interfaces:**
- Consumes: `createPost` (T5), `useRouter` from `next/navigation`, `ClusterNode.kind` string (`'root'|'internal'|'leaf'|'not_clusterable'|'segment'`), `ClusteringResult.id` (as `resultId`).
- Produces: a button labeled "Create post" rendered only when `node.kind ∈ {leaf, internal, segment}` and `node.photoCount > 0`.

**GREEN obligation (for the implementer):** Pass the active result's `id` into `TreeNodeView` as `resultId`. Render a "Create post" button on selectable non-empty nodes; on click call `createPost({ resultId, nodeId: node.id })` and `router.push('/posts/${post.id}/edit')`. Surface a failure via the existing error state. No button on `root`/`not_clusterable`/empty nodes.

- [ ] **Step 1: Write the RED tests** (append to `ClusterView.spec.tsx`; add `createPost` to the `lib/api` mock and mock `next/navigation`)

```ts
// add to the vi.mock('../../lib/api', ...) factory: createPost: vi.fn()
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

it('shows "Create post" on a selectable node and routes to the editor on click', async () => {
  // why: the bridge — a real (non-root, non-empty) cluster node becomes a draft.
  vi.mocked(api.createPost).mockResolvedValue({ id: 'post-9', photos: [] } as never);
  render(<ClusterView />);
  fireEvent.click(await screen.findByTestId('result-row'));
  const btn = await screen.findByRole('button', { name: /create post/i });
  fireEvent.click(btn);
  await waitFor(() => expect(api.createPost).toHaveBeenCalledWith({ resultId: 'r1', nodeId: 'seg' }));
  await waitFor(() => expect(push).toHaveBeenCalledWith('/posts/post-9/edit'));
});

it('does not show "Create post" on the root node', async () => {
  // why: 4o2 #3 — root would snapshot the whole tree incl. not_clusterable.
  render(<ClusterView />);
  fireEvent.click(await screen.findByTestId('result-row'));
  await screen.findByText('Canon EOS R5'); // tree rendered
  // the only Create-post button belongs to the selectable 'seg' child, not root
  expect(screen.getAllByRole('button', { name: /create post/i })).toHaveLength(1);
});

it('does not show "Create post" on a not_clusterable or empty node', async () => {
  vi.mocked(api.getClusteringResult).mockResolvedValue({
    ...TREE,
    root: { ...TREE.root, children: [
      { ...TREE.root.children[0], id: 'nc', kind: 'not_clusterable' },
      { ...TREE.root.children[0], id: 'mt', kind: 'leaf', photoCount: 0, items: [] }
    ] }
  });
  render(<ClusterView />);
  fireEvent.click(await screen.findByTestId('result-row'));
  await waitFor(() => expect(screen.queryByRole('button', { name: /create post/i })).toBeNull());
});
```

- [ ] **Step 2: Run — confirm RED**

Run: `pnpm --filter web test -- ClusterView`
Expected: FAIL — no "Create post" button exists.

- [ ] **Step 3: Add the stub surface**

Give `TreeNodeView` a `resultId: string` prop and render a disabled placeholder button `Create post` (no handler) ONLY as the minimal symbol so tests resolve — OR leave the component unchanged and let the RED stand on the missing button. Prefer leaving it unchanged (the missing-button RED is honest); do not implement the click/route/guard here.

- [ ] **Step 4: Confirm still RED + typecheck**

Run: `pnpm --filter web test -- ClusterView` (FAIL — button absent) and `make typecheck`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/clusters/ClusterView.tsx apps/web/components/clusters/ClusterView.spec.tsx
git commit -m "skeleton(018): web ClusterView — create-post affordance RED (T6)"
```

---

### Task 7: web PostEditor — route + editor component

**Files:**
- Stub: `apps/web/components/posts/PostEditor.tsx` (component; body renders a not-ready placeholder)
- Stub: `apps/web/app/(app)/posts/[id]/edit/page.tsx` (reads route param, renders `<PostEditor postId=... />`)
- Test: `apps/web/components/posts/PostEditor.spec.tsx` (RED)

**Interfaces:**
- Consumes: `getPost`, `updatePost`, `listPhotos` (T5 + existing); `PhotoAsset.variants` for thumbnail URLs.
- Produces: `export function PostEditor({ postId }: { postId: string })`. Title `<input>`, body `<textarea>`, a per-photo row (thumbnail `<img>` + caption `<input>` + `↑`/`↓` buttons + remove), a "Save" button. Save calls `updatePost(postId, { title, body, photos: currentList.map(({photoId,caption}) => ({photoId,caption})) })` in current display order.

**GREEN obligation (for the implementer):** On mount `getPost(postId)` (and `listPhotos({status:['ready'],pageSize:500})` for the variant map). Render title/body/photo-rows. ↑/↓ reorder the in-memory list; remove drops a photo; caption edits update the list. "Save" → `updatePost`. A `getPost` rejection renders an error message. Resolve each photo's thumbnail like `ClusterView` (variant `thumbnail`, fallback to the id). Order is the array position at Save time.

- [ ] **Step 1: Write the RED tests** (`PostEditor.spec.tsx`)

```ts
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../lib/api';
import { PostEditor } from './PostEditor';

vi.mock('../../lib/api', () => ({ getPost: vi.fn(), updatePost: vi.fn(), listPhotos: vi.fn() }));

function post() {
  return {
    id: 'post-1', userId: 'u1', sourceClusterId: 'n', sourceResultId: 'r',
    title: 'Trip', body: 'day one', status: 'draft', visibility: 'private', slug: '',
    locationLabel: '', dateFrom: '', dateTo: '', mapEnabled: false, publishedAt: '',
    createdAt: 'c', updatedAt: 'u',
    photos: [
      { photoId: 'p1', order: 0, caption: 'first' },
      { photoId: 'p2', order: 1, caption: 'second' }
    ]
  };
}
function photoAsset(id: string) {
  return { id, filename: `${id}.jpg`, contentType: 'image/jpeg', sizeBytes: '1', objectKey: id,
    status: 'ready', createdAt: 'c', updatedAt: 'u',
    variants: [{ variantType: 'thumbnail', url: `http://img/${id}.jpg`, width: 40, height: 40 }] };
}

beforeEach(() => {
  vi.mocked(api.getPost).mockResolvedValue(post() as never);
  vi.mocked(api.updatePost).mockResolvedValue(post() as never);
  vi.mocked(api.listPhotos).mockResolvedValue({ photos: [photoAsset('p1'), photoAsset('p2')], totalCount: 2 } as never);
});

it('loads the post and renders title, body, and photo thumbnails', async () => {
  render(<PostEditor postId="post-1" />);
  expect(await screen.findByDisplayValue('Trip')).toBeTruthy();
  expect(screen.getByDisplayValue('day one')).toBeTruthy();
  expect((await screen.findByAltText('p1.jpg')).getAttribute('src')).toBe('http://img/p1.jpg');
});

it('saves an edited title and body', async () => {
  render(<PostEditor postId="post-1" />);
  fireEvent.change(await screen.findByDisplayValue('Trip'), { target: { value: 'Buenos Aires' } });
  fireEvent.change(screen.getByDisplayValue('day one'), { target: { value: 'morning' } });
  fireEvent.click(screen.getByRole('button', { name: /save/i }));
  await waitFor(() => expect(api.updatePost).toHaveBeenCalledWith('post-1',
    expect.objectContaining({ title: 'Buenos Aires', body: 'morning' })));
});

it('saves an edited caption on the right photo', async () => {
  render(<PostEditor postId="post-1" />);
  fireEvent.change(await screen.findByDisplayValue('first'), { target: { value: 'sunrise' } });
  fireEvent.click(screen.getByRole('button', { name: /save/i }));
  await waitFor(() => {
    const patch = vi.mocked(api.updatePost).mock.calls[0][1];
    expect(patch.photos).toEqual([
      { photoId: 'p1', caption: 'sunrise' },
      { photoId: 'p2', caption: 'second' }
    ]);
  });
});

it('reorders a photo down and saves the new order', async () => {
  render(<PostEditor postId="post-1" />);
  await screen.findByAltText('p1.jpg');
  fireEvent.click(screen.getAllByRole('button', { name: /move down/i })[0]); // move p1 below p2
  fireEvent.click(screen.getByRole('button', { name: /save/i }));
  await waitFor(() => {
    const patch = vi.mocked(api.updatePost).mock.calls[0][1];
    expect(patch.photos.map((p: { photoId: string }) => p.photoId)).toEqual(['p2', 'p1']);
  });
});

it('removes a photo and saves without it', async () => {
  render(<PostEditor postId="post-1" />);
  await screen.findByAltText('p1.jpg');
  fireEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]); // remove p1
  fireEvent.click(screen.getByRole('button', { name: /save/i }));
  await waitFor(() => {
    const patch = vi.mocked(api.updatePost).mock.calls[0][1];
    expect(patch.photos.map((p: { photoId: string }) => p.photoId)).toEqual(['p2']);
  });
});

it('shows an error when the post cannot be loaded (404 / not owned)', async () => {
  vi.mocked(api.getPost).mockRejectedValue(new Error('GetPost failed: 404'));
  render(<PostEditor postId="ghost" />);
  await screen.findByText(/404|could not|not found/i);
});
```

- [ ] **Step 2: Run — confirm RED**

Run: `pnpm --filter web test -- PostEditor`
Expected: FAIL — `PostEditor` renders only a placeholder (no inputs/photos/save).

- [ ] **Step 3: Write the stub signatures**

```tsx
// apps/web/components/posts/PostEditor.tsx
'use client';
export function PostEditor({ postId }: { postId: string }) {
  // GREEN is the implementer's job — load getPost(postId), render title/body/
  // photo rows (caption + ↑/↓ + remove) and Save via updatePost.
  return <p>Loading post {postId}…</p>;
}
```

```tsx
// apps/web/app/(app)/posts/[id]/edit/page.tsx
import { PostEditor } from '../../../../../components/posts/PostEditor';
export default function PostEditPage({ params }: { params: { id: string } }) {
  return <PostEditor postId={params.id} />;
}
```

- [ ] **Step 4: Confirm still RED + typecheck**

Run: `pnpm --filter web test -- PostEditor` (FAIL on behavior) and `make typecheck`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/posts/PostEditor.tsx apps/web/components/posts/PostEditor.spec.tsx 'apps/web/app/(app)/posts/[id]/edit/page.tsx'
git commit -m "skeleton(018): web PostEditor + route RED (T7)"
```

---

### Task 8: live acceptance — smoke-publication + smoke-ui (dqb)

**Files:**
- Modify: `scripts/smoke-publication.sh` (post a **selectable child** node not root; assert ROOT create → 400; assert replace-all reorder/caption/remove; assert 4o2 #6 title-only PATCH preserves photos + dates)
- Modify/Add: `apps/web/smoke/` (a Playwright scenario: open a ready result → Create post → editor renders variant thumbnails → edit title → Save)

**Interfaces:** the full live HTTP↔gRPC↔Postgres path + the browser UI on a running `make dev` stack.

**GREEN obligation (for the implementer):** these are the acceptance oracles — authored now, run **green** during GREEN (they need a live stack), before the final review.

- [ ] **Step 1: Author the smoke assertions**

In `scripts/smoke-publication.sh`:
- Replace the node pick (currently `NODE_ID=$(jq -r '.root.id' ...)`, `EXPECTED_COUNT=.root.photoCount`) with a **non-root selectable** node: `NODE_ID=$(jq -r '.root.children[0].id' "$RESULT_PATH")`, `EXPECTED_COUNT=$(jq -r '.root.children[0].photoCount' "$RESULT_PATH")`. (The time_only Canon-burst fixture yields a root with a selectable child holding both photos.)
- After the create, assert the ROOT node is rejected:
  ```bash
  ROOT_ID="$(jq -r '.root.id' "$RESULT_PATH")"
  CODE="$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_PATH" -H 'content-type: application/json' \
    -d "{\"resultId\":\"$RESULT_ID\",\"nodeId\":\"$ROOT_ID\"}" "$API_BASE_URL/v1/posts")"
  [ "$CODE" = "400" ] || { echo "ASSERTION FAILED: ROOT create returned $CODE (expected 400)" >&2; exit 1; }
  ```
- Replace-all round-trip: read the created post's photo ids, PATCH `photos` reversed with a caption on the first, assert the returned `photos` order + caption; then PATCH a single-photo subset and assert length 1 (remove). Assert order values are `0..n-1`.
- 4o2 #6: after a `{"title":"..."}`-only PATCH, assert `.photos | length` and `.dateFrom` are unchanged from before the PATCH.

In `apps/web/smoke/` (mirror `gallery.smoke.ts`): sign in on the live stack, open a ready clustering result, click "Create post", assert the editor route renders a photo thumbnail `<img>` and the title input; edit the title and Save; reload and assert it persisted.

- [ ] **Step 2: (GREEN phase) run live**

Run: `make dev` up, then `make smoke-publication` and `make smoke-ui`.
Expected: both green. (Not runnable at skeleton time — no stubbed impl — so this step is executed during GREEN, gating the final review.)

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke-publication.sh apps/web/smoke/
git commit -m "skeleton(018): live acceptance — smoke-publication + smoke-ui editor (T8)"
```

---

## Skeleton acceptance

After T1–T7 are committed: `make skeleton-gate` green (stubs typecheck, RED tests present and failing on behavior), `make typecheck` + `make lint` clean, `make proto-check` clean. T8's live smokes gate the final review, run during GREEN. New-code coverage is enforced by `make coverage-gate` at the end of GREEN.

## Self-Review

- **Obligation coverage (spec → RED):** replace-all mutation → T2 (guard) + T3 (mapping) + T8 (persist/order); presence/title-only-untouched → T2 + T3 + T8 (4o2 #6); client-side photo URLs → T7 (thumbnail render) + T8 (smoke render); node-selection guard → T2 (domain) + T6 (UI hides button) + T8 (ROOT→400); explicit Save → T7; 4o2 #1 visibility 400 → T4; 4o2 #2 date 400 → T4; 4o2 #4 DTO → T4; 4o2 #3 → T2/T6/T8; 4o2 #6 → T2/T8. `4o2 #5` (dedup) is subsumed — replace-all rejects duplicates (T2) and the create path is unchanged. **No uncovered obligation.**
- **Skeleton-failure scan:** no TBD/TODO in tests or signatures; every test has a fixture + concrete expected value + a why.
- **Type consistency:** `PostPhotoInput {photoId,caption}` is the single input shape across proto (`PostPhotoInput`), domain (`post.types.ts`), gateway (`UpdatePostBody/Input.photos`), and web (`UpdatePostPatch.photos`); order is always positional; error strings `'invalid photo membership'`/`'node not selectable'`/`'empty node'` match between T2 (thrown) and T3 (mapped).
- **No GREEN:** every task ships stubs/RED only; guards, mappings, fetches, and the editor body are the implementer's.
