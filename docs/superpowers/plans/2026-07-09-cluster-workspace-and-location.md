# Cluster workspace + manual location (9q4.2 / 9q4.3) — Skeleton Commit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to fill this skeleton task-by-task — each task makes its RED tests green within the provided stubs. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the clustering surface into a workspace — delete a run, and view a result as tree / **map** / **time histogram** — and let a user manually set a photo's location (place label + a map-clicked point), composing with the map.

**Architecture / WHY:** exSDD skeleton-first. Map + histogram are **pure web-side joins** (result tree `photo_id`s × the `photosById` map `ClusterView` already loads) — zero cluster-service change for viewing; the map reads exact `photo_assets.lat/lon` (already on the wire, no `irf`). Delete is a **soft-delete** over the existing `deleted_at` seam (ADR-0005; tree untouched). Manual location is an **owner-scoped** `SetPhotoLocation` that upserts the 022 dedup `Location` + writes `photo_assets.{location_id,lat,lon}`. The map is **Leaflet + a vendored vector GeoJSON basemap, no tiles** (web↔gateway-only invariant); its pure logic is 100%-covered, the Leaflet glue is a separate `coverage.exclude`d file verified by the live smoke. Entry points: design → `docs/superpowers/specs/2026-07-09-cluster-workspace-and-location-design.md`; contracts → `proto/cluster/v1/cluster_service.proto` (`DeleteClusteringResult`) + `proto/photo/v1/photo_service.proto` (`SetPhotoLocation`); delete → `cluster_service/store.py`+`server.py` + `tests/test_store.py`/`test_server.py`; location → `photo.service.ts` + `photo.service.spec.ts`; pure map/hist → `components/map/points.ts` + `components/clusters/histogram.ts` (+ specs); glue → `components/map/PhotoMap.tsx` (coverage-excluded); live oracle → `apps/web/smoke/clusters.smoke.ts` + `scripts/lib/photoops-e2e.sh`. Durable why/invariants → `docs/adr/0008-*` + each service's `## Local invariants` at GREEN, not here.

**Tech Stack:** Python 3.12 (cluster-service, pytest), TypeScript (photo-service + api-gateway = NestJS/vitest; web = Next 15 / React 19 / vitest-jsdom + Playwright), proto3 (buf), Leaflet (new web dep), Drizzle (photo-db).

## Global Constraints

- **web talks only to api-gateway** (+ presigned MinIO). The map uses a **vendored GeoJSON basemap + `L.circleMarker`, NO `tileLayer`, NO `L.marker`/`L.Icon.Default`** — zero external calls.
- **100% new-code coverage** (`make coverage-gate`/`skeleton-gate`). The Leaflet glue file goes in `apps/web/vitest.config.ts` `coverage.exclude` (inline `/* c8 ignore */` alone is insufficient under `coverage.all:true`); all logic lives in pure modules that ARE covered.
- **No binary committed** (`test-guard`/`a5k`): the basemap is **text GeoJSON**; leaflet is an npm dep (`node_modules` gitignored); commit the updated `pnpm-lock.yaml`.
- **Owner-scoping on every new route** — `SetPhotoLocation` and `DeleteClusteringResult` filter `WHERE … user_id = $caller`; the caller `user_id` is the gateway-validated session (no IDOR).
- **Immutability (ADR-0005):** delete sets only `deleted_at`; never mutate the node/item tree.
- **Cross-service refs are UUID v7, no cross-service FK.**
- **Proto-first:** edit `.proto` → `make proto` → commit `packages/proto-ts` **and** `apps/cluster-service/src/photoops_proto/{cluster,photo}/v1` (both RPCs regen the Python client stubs); **pin `proto/buf.gen.cluster-python.yaml`** (`643`) to avoid a CI/local plugin-float `proto-check` mismatch. **Rebuild BOTH images** per RPC (cluster-service+gateway for delete; photo-service+gateway for set-location) — a restart drops new fields as unknown.

## Non-Goals

- **Cluster-level location** (a cluster→location override) — deferred (immutable results; new bead).
- **Clearing/unsetting** a location — set-only this session (new bead).
- **Auto reverse-geocode** of the clicked point (type-a-place → coords) — deferred; the user supplies both label and point.
- **`irf`** (typed `lat/lon` on proto `GeoPlace`) — dropped, no consumer; the map reads `photo_assets.lat/lon`.
- **External map tiles / slippy basemap providers / `L.marker` default PNGs** — banned by the gateway-only invariant.
- **>500 photos per result** on the map/histogram — capped by the existing `listPhotos({pageSize:500})`; surface "N of M placed", do not fetch more.
- **Restore of a soft-deleted run**, pan/zoom-tuned histogram, per-node (vs whole-result) views — out of scope.

---

### Task 1: Proto contracts — `DeleteClusteringResult` + `SetPhotoLocation` (+ pin cluster-python)

**Files:**
- Modify: `proto/cluster/v1/cluster_service.proto` (new RPC + 2 messages)
- Modify: `proto/photo/v1/photo_service.proto` (new RPC + 1 message)
- Modify: `proto/buf.gen.cluster-python.yaml` (pin plugin versions — `643`)
- Generated (commit, do not hand-edit): `packages/proto-ts/...`, `apps/cluster-service/src/photoops_proto/{cluster,photo}/v1/...`

**Interfaces:**
- Produces (cluster): `DeleteClusteringResultRequest{ string result_id=1; string user_id=2; }` → `DeleteClusteringResultResponse{}`; HTTP `delete: /v1/clustering-results/{result_id}` (decorative — the NestJS gateway route is authoritative).
- Produces (photo): `SetPhotoLocationRequest{ string photo_id=1; string user_id=2; GeoPlace place=3; optional double lat=4; optional double lon=5; }` → `PhotoAsset`; HTTP `post: /v1/photos/{photo_id}/location` (decorative; sibling-consistent — the real Nest route is `/photos/:id/location`, Task 4).

**GREEN obligation:** none beyond the contract — this task IS the contract. Its fail-on-drift home is `make proto-check` + downstream typecheck, not a unit test. `GeoPlace` is **reused unchanged** (no `lat/lon` added — `irf` dropped); the point rides as request fields 4/5.

- [ ] **Step 1: Pin cluster-python plugins** — in `proto/buf.gen.cluster-python.yaml` give `protocolbuffers/python`, `protocolbuffers/pyi`, and `grpc/python` explicit `:vX.Y.Z` (mirror how `buf.gen.yaml` pins ts-proto), so regeneration doesn't rewrite a floating version header and redden `proto-check` (the `643` failure mode). Match the version already emitted in `apps/cluster-service/src/photoops_proto/**/*_pb2.py` headers.

- [ ] **Step 2: Add the cluster RPC + messages** — in `cluster_service.proto`, after `ListClusteringResults` (`:37-39`) inside `service ClusterService`:

```proto
  // Soft-delete one of the caller's clustering runs. Non-owned / already-deleted
  // / unknown id → NOT_FOUND. The immutable tree is untouched — only deleted_at is
  // set (ADR-0005 seam); restore is deferred.
  rpc DeleteClusteringResult(DeleteClusteringResultRequest) returns (DeleteClusteringResultResponse) {
    option (google.api.http) = {delete: "/v1/clustering-results/{result_id}"};
  }
```

and, alongside the other request/response messages:

```proto
message DeleteClusteringResultRequest {
  string result_id = 1;
  string user_id = 2;  // owner scope (gateway-validated session)
}

message DeleteClusteringResultResponse {}
```

- [ ] **Step 3: Add the photo RPC + message** — in `photo_service.proto`, after `GetPhoto` (`:32-34`) inside `service PhotoService`:

```proto
  // Manually set/override a photo's location: a place label (deduped via the
  // 022 Location table) + an OPTIONAL exact point (map-clicked). Owner-scoped;
  // returns the updated asset. (Annotation decorative — the hand-written gateway
  // route is POST /photos/{photo_id}/location.)
  rpc SetPhotoLocation(SetPhotoLocationRequest) returns (PhotoAsset) {
    option (google.api.http) = {
      post: "/v1/photos/{photo_id}/location"
      body: "*"
    };
  }
```

and a new message (reusing `GeoPlace` from `processing.proto`, already imported at `:7`):

```proto
message SetPhotoLocationRequest {
  string photo_id = 1;
  string user_id = 2;               // owner scope
  GeoPlace place = 3;               // place labels (022 message, reused)
  optional double lat = 4;          // captured point; absent = label-only
  optional double lon = 5;
}
```

- [ ] **Step 4: Regenerate + verify no drift** — `make proto`, then `git status`: `packages/proto-ts` **and** `apps/cluster-service/src/photoops_proto/{cluster,photo}/v1/*` must be staged with only the intended additions (no floating header — Step 1). Run `make proto-check` (Expected: PASS — generated == committed).

- [ ] **Step 5: Commit the contract**

```bash
git add proto/ packages/proto-ts/ apps/cluster-service/src/photoops_proto/ proto/buf.gen.cluster-python.yaml
git commit -m "skeleton(023): proto — DeleteClusteringResult + SetPhotoLocation (+ pin cluster-python)"
```

---

### Task 2: cluster-service — soft-delete (delete-aware store + servicer)

**Files:**
- Modify: `apps/cluster-service/src/cluster_service/store.py` (`StoredResult` field, `Store` Protocol, `InMemoryStore`)
- Modify: `apps/cluster-service/src/cluster_service/server.py` (`DeleteClusteringResult` handler)
- Test: `apps/cluster-service/tests/test_store.py` (RED — soft-delete semantics)
- Test: `apps/cluster-service/tests/test_server.py` (RED — handler → NOT_FOUND parity)

**Interfaces:**
- Consumes: Task 1 proto (`pb.DeleteClusteringResultRequest/Response`).
- Produces: `Store.soft_delete(*, result_id: str, user_id: str) -> bool` (True = a live owned row was soft-deleted; False = absent / non-owned / already deleted). `StoredResult.deleted_at: str | None = None`. `get`/`list_for_user` skip soft-deleted rows.

**GREEN obligation (for the implementer):** make the RED tests below pass within these stubs — add the `PostgresStore.soft_delete` SQL (`UPDATE clustering_results SET deleted_at=now() WHERE id=%s AND user_id=%s AND deleted_at IS NULL RETURNING id`; `# pragma: no cover` real adapter) and wire the servicer. You may add narrower tests; you may not weaken/delete/rename these REDs.

- [ ] **Step 1: Write the RED tests** — append to `apps/cluster-service/tests/test_store.py`:

```python
def test_soft_delete_hides_from_get_and_list() -> None:
    # why: delete is a read-filter over deleted_at; the run must vanish from both readers
    s = InMemoryStore()
    _pending(s, result_id="r1", user_id="u1")
    assert s.soft_delete(result_id="r1", user_id="u1") is True
    assert s.get(result_id="r1", user_id="u1") is None
    assert [r.id for r in s.list_for_user(user_id="u1")] == []


def test_soft_delete_is_owner_scoped_and_idempotent() -> None:
    # why: a non-owner or a second delete must not succeed → maps to NOT_FOUND, not 200
    s = InMemoryStore()
    _pending(s, result_id="r1", user_id="u1")
    assert s.soft_delete(result_id="r1", user_id="u2") is False   # non-owner
    assert s.soft_delete(result_id="r1", user_id="u1") is True    # owner
    assert s.soft_delete(result_id="r1", user_id="u1") is False   # already deleted
    assert s.soft_delete(result_id="missing", user_id="u1") is False
```

and append to `apps/cluster-service/tests/test_server.py` (mirror its existing servicer+`FakeContext` harness):

```python
def test_delete_clustering_result_not_found_aborts() -> None:
    # why: parity with GetClusteringResult — a 0-row delete is NOT_FOUND, never a blanket OK
    servicer, _ = _make_servicer()  # existing helper: (ClusterServicer, store/publisher)
    ctx = FakeContext()
    servicer.DeleteClusteringResult(
        pb.DeleteClusteringResultRequest(result_id="missing", user_id="u1"), ctx
    )
    assert ctx.code == grpc.StatusCode.NOT_FOUND


def test_delete_clustering_result_soft_deletes_owned_run() -> None:
    # why: an owned run is removed from the caller's list after delete
    servicer, store = _make_servicer()
    store.create_pending(result_id="r1", user_id="u1", method="time_only", params_json="{}", scope="all")
    servicer.DeleteClusteringResult(pb.DeleteClusteringResultRequest(result_id="r1", user_id="u1"), FakeContext())
    assert store.list_for_user(user_id="u1") == []
```

> If `test_server.py` lacks a reusable `_make_servicer()`/`FakeContext`, add them mirroring the existing servicer construction in that file (do not invent a second style).

- [ ] **Step 2: Run to confirm RED** — `make test-cluster` (or `pytest apps/cluster-service/tests/test_store.py -k soft_delete -v`). Expected: FAIL — `InMemoryStore` has no `soft_delete` / servicer has no `DeleteClusteringResult`.

- [ ] **Step 3: Write the stubs** — in `store.py`: add `deleted_at: str | None = None` to `StoredResult`; add to the `Store` Protocol `def soft_delete(self, *, result_id: str, user_id: str) -> bool: ...`; in `InMemoryStore` add the read-filter to `get` (`or r.deleted_at is not None → None`) and `list_for_user` (skip deleted), and:

```python
    def soft_delete(self, *, result_id: str, user_id: str) -> bool:
        r = self._results.get(result_id)
        if r is None or r.user_id != user_id or r.deleted_at is not None:
            return False
        r.deleted_at = self._now
        return True
```

In `server.py` add the handler (raises within, GREEN wires the store call is trivial — but the servicer method must exist and abort on miss):

```python
    def DeleteClusteringResult(self, request, context):  # type: ignore[no-untyped-def]
        raise NotImplementedError  # GREEN: soft_delete → NOT_FOUND on False
```

- [ ] **Step 4: Confirm still RED + lint** — re-run Step 2 (Expected: `test_store` REDs now runnable and FAIL on behavior until `InMemoryStore` filters are added; `test_server` FAILs on `NotImplementedError`). `make lint-cluster` clean.

- [ ] **Step 5: Commit the skeleton**

```bash
git add apps/cluster-service/src/cluster_service/store.py apps/cluster-service/src/cluster_service/server.py apps/cluster-service/tests/test_store.py apps/cluster-service/tests/test_server.py
git commit -m "skeleton(023): cluster-service soft-delete (RED + stubs)"
```

---

### Task 3: photo-service — `SetPhotoLocation` (owner-scoped orchestration)

**Files:**
- Modify: `apps/photo-service/src/photo/photo.service.ts` (`PhotoRepositoryPort.setLocationForUser` + `PhotoDomainService.setPhotoLocation`)
- Modify: `apps/photo-service/src/photo/photo.repository.ts` (owner-scoped writer stub)
- Modify: `apps/photo-service/src/photo/photo.grpc.controller.ts` (`SetPhotoLocation` RPC handler)
- Test: `apps/photo-service/src/photo/photo.service.spec.ts` (RED — orchestration via fake repo)

**Interfaces:**
- Consumes: existing `normalizePlace`, `upsertLocation`, `findByIdWithVariantsForUser`, `listLocationsByIds`.
- Produces: `PhotoRepositoryPort.setLocationForUser(userId: string, photoId: string, patch: { locationId: string; lat: number | null; lon: number | null }): Promise<boolean>` (owner-scoped `UPDATE … WHERE id AND user_id`; True = a row was updated). `PhotoDomainService.setPhotoLocation(userId: string, photoId: string, place: GeoPlaceInput, lat: number | null, lon: number | null): Promise<PhotoWithVariants>` — throws a not-found domain error when `setLocationForUser` returns false.

**GREEN obligation (for the implementer):** implement `setLocationForUser`'s SQL (owner-scoped; smoke-verified — no in-process DB, `4vg`) and `setPhotoLocation`'s orchestration: `normalizePlace(place)` → `upsertLocation({…normalized, lat, lon, rawProviderData:{source:'manual'}})` → `setLocationForUser(userId, photoId, {locationId, lat, lon})`; on `false` throw the not-found error the controller maps to gRPC `NOT_FOUND`; on success re-read via the existing owner-scoped compose (mirror `getPhoto`) and return it. Do not reuse the unscoped `applyAttributes`/`setStatus`. Do not weaken the REDs.

- [ ] **Step 1: Write the RED tests** — add to `apps/photo-service/src/photo/photo.service.spec.ts` (extend the `createService()` repo mock with `setLocationForUser: vi.fn()`):

```typescript
it('setPhotoLocation upserts the normalized place with the captured point, owner-scoped', async () => {
  // why: manual set writes the 022 dedup Location (source:manual) AND photo_assets.lat/lon,
  // scoped to the caller — the composed reply carries the new place.
  const { service, repository } = createService();
  repository.upsertLocation.mockResolvedValue('loc-9');
  repository.setLocationForUser.mockResolvedValue(true);
  repository.findByIdWithVariantsForUser.mockResolvedValue({
    photo: makePhotoRecord({ id: 'photo-1', locationId: 'loc-9', lat: 48.85, lon: 2.35 }),
    variants: []
  });
  repository.listLocationsByIds.mockResolvedValue([
    { id: 'loc-9', continent: 'Europe', country: 'France', region: 'Île-de-France', city: 'Paris', district: '', lat: 48.85, lon: 2.35 }
  ]);

  const out = await service.setPhotoLocation(
    'user-1', 'photo-1',
    { continent: 'Europe', country: 'France', region: 'Île-de-France', city: 'Paris', district: '' },
    48.85, 2.35
  );

  expect(repository.upsertLocation).toHaveBeenCalledWith(expect.objectContaining({
    country: 'France', city: 'Paris', lat: 48.85, lon: 2.35, rawProviderData: { source: 'manual' }
  }));
  expect(repository.setLocationForUser).toHaveBeenCalledWith('user-1', 'photo-1', { locationId: 'loc-9', lat: 48.85, lon: 2.35 });
  expect(out.photo.locationId).toBe('loc-9');
});

it('setPhotoLocation throws NOT_FOUND when the photo is not the caller\'s', async () => {
  // why: the IDOR fix — a foreign/unknown photo_id must not write; false → not-found
  const { service, repository } = createService();
  repository.upsertLocation.mockResolvedValue('loc-9');
  repository.setLocationForUser.mockResolvedValue(false);
  await expect(
    service.setPhotoLocation('user-1', 'other-photo', { country: 'France', city: 'Paris' } as never, null, null)
  ).rejects.toThrow(/not found/i);
});
```

- [ ] **Step 2: Run to confirm RED** — `make test-photo` (Expected: FAIL — `service.setPhotoLocation` and `repository.setLocationForUser` do not exist).

- [ ] **Step 3: Write the stubs** — in `photo.service.ts` add to `PhotoRepositoryPort` the `setLocationForUser` signature (above), and to `PhotoDomainService`:

```typescript
  async setPhotoLocation(userId: string, photoId: string, place: GeoPlaceInput, lat: number | null, lon: number | null): Promise<PhotoWithVariants> {
    throw new Error('not implemented');  // GREEN: normalize→upsert→scoped write→compose
  }
```

In `photo.repository.ts` add the owner-scoped writer stub (mirrors `applyAttributes` but `WHERE id AND user_id`, returns `boolean`):

```typescript
  async setLocationForUser(userId: string, photoId: string, patch: { locationId: string; lat: number | null; lon: number | null }): Promise<boolean> {
    throw new Error('not implemented');  // GREEN: UPDATE ... WHERE id AND user_id → rowCount>0
  }
```

In `photo.grpc.controller.ts` add a `SetPhotoLocation` handler stub that maps the request → `service.setPhotoLocation(...)` → `toProtoPhoto`, translating the not-found error to a gRPC `NOT_FOUND` status (mirror how other handlers surface errors). Body may `throw new Error('not implemented')`.

- [ ] **Step 4: Confirm still RED + typecheck** — re-run Step 2 (FAIL on behavior, symbols resolve). `make typecheck` clean (the new port method is implemented by both the fake in the spec and the real repo stub).

- [ ] **Step 5: Commit the skeleton**

```bash
git add apps/photo-service/src/photo/photo.service.ts apps/photo-service/src/photo/photo.repository.ts apps/photo-service/src/photo/photo.grpc.controller.ts apps/photo-service/src/photo/photo.service.spec.ts
git commit -m "skeleton(023): photo-service SetPhotoLocation owner-scoped (RED + stubs)"
```

---

### Task 4: api-gateway — DELETE run route + POST photo-location route

**Files:**
- Modify: `apps/api-gateway/src/http/cluster.controller.ts` (`@Delete`) + `src/grpc/cluster.client.ts` (`deleteClusteringResult`)
- Modify: `apps/api-gateway/src/http/photo.controller.ts` (`@Post(':photoId/location')`) + `src/grpc/photo.client.ts` (`setPhotoLocation`)
- Test: the gateway controller specs mirroring the existing ones (RED — route calls client with owner scope)

**Interfaces:**
- Consumes: Task 1 proto (both clients runtime-load `.proto`); `AuthService.requireSession(cookie) → { userId }`.
- Produces: `DELETE /v1/clustering-results/:resultId` → `clusterClient.deleteClusteringResult({ resultId, userId })`; `POST /photos/:photoId/location` (body `{ place, lat?, lon? }`) → `photoClient.setPhotoLocation({ photoId, userId, place, lat, lon })` → mapped photo (reuse `mapPhoto`).

**GREEN obligation:** implement both routes; each calls `requireSession` first and passes `auth.userId` as the owner scope (never the body). The cluster controller is `@Controller('v1')` → `@Delete('clustering-results/:resultId')`. The photo controller is `@Controller('photos')` → `@Post(':photoId/location')` (NOT `@Post('photos/...')`, which doubles to `/photos/photos/...`). Add the client methods (mirror existing `getClusteringResult`/`getPhoto` client calls). Do not weaken the REDs.

- [ ] **Step 1: Write the RED tests** — mirror the existing controller specs (they construct the controller with a mocked client + `AuthService`). Assert:

```typescript
// cluster.controller.spec — why: delete is owner-scoped via the validated session, not the path alone
it('DELETE /clustering-results/:id calls the client with the session userId', async () => {
  auth.requireSession.mockResolvedValue({ userId: 'u1' });
  clusterClient.deleteClusteringResult.mockResolvedValue({});
  await controller.deleteResult('r1', 'cookie=x');
  expect(clusterClient.deleteClusteringResult).toHaveBeenCalledWith({ resultId: 'r1', userId: 'u1' });
});

// photo.controller.spec — why: set-location passes the body place+point AND the session userId
it('POST /photos/:id/location calls the client with body place/point + session userId', async () => {
  auth.requireSession.mockResolvedValue({ userId: 'u1' });
  photoClient.setPhotoLocation.mockResolvedValue(makeProtoPhoto({ id: 'photo-1' }));
  const body = { place: { country: 'France', city: 'Paris' }, lat: 48.85, lon: 2.35 };
  await controller.setLocation('photo-1', body, 'cookie=x');
  expect(photoClient.setPhotoLocation).toHaveBeenCalledWith(
    expect.objectContaining({ photoId: 'photo-1', userId: 'u1', place: body.place, lat: 48.85, lon: 2.35 })
  );
});
```

- [ ] **Step 2: Run to confirm RED** — `make test` (TS workspaces) or the gateway package test. Expected: FAIL — `controller.deleteResult`/`controller.setLocation` and the client methods do not exist.

- [ ] **Step 3: Write the stubs** — add the controller methods (decorated, body `throw new Error('not implemented')`) and the client method stubs (`deleteClusteringResult(req): Promise<Record<string, never>>`, `setPhotoLocation(req): Promise<PhotoRaw>` — mirror the raw interfaces + `new Promise`/`callback` wrapper used by the existing client methods).

- [ ] **Step 4: Confirm still RED + typecheck** — re-run Step 2 (FAIL on behavior). `make typecheck` clean.

- [ ] **Step 5: Commit the skeleton**

```bash
git add apps/api-gateway/src/
git commit -m "skeleton(023): gateway delete-run + set-location routes (RED + stubs)"
```

---

### Task 5: web — API client (`deleteClusteringResult` + `setPhotoLocation`)

**Files:**
- Modify: `apps/web/lib/api.ts`
- Test: `apps/web/lib/api.spec.ts` (RED — URL/method/body; mirror `api.publish.spec.ts`)

**Interfaces:**
- Produces: `deleteClusteringResult(resultId: string): Promise<void>` → `DELETE ${API_BASE_URL}/v1/clustering-results/:id`; `setPhotoLocation(photoId: string, input: { place: { continent?; country?; region?; city?; district? }; lat?: number; lon?: number }): Promise<PhotoAsset>` → `POST ${API_BASE_URL}/photos/:id/location` (JSON body).

**GREEN obligation:** implement both `fetch` wrappers (mirror `unpublishPost` for DELETE, `createPost` for the POST-with-body); `credentials:'include'`, `readErrorMessage` on `!ok`. Do not weaken the REDs.

- [ ] **Step 1: Write the RED test** — add to `apps/web/lib/api.spec.ts`:

```typescript
it('deleteClusteringResult DELETEs the run', async () => {
  // why: first DELETE in the client — path + method are the contract
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal('fetch', fetchMock);
  await deleteClusteringResult('r1');
  expect(fetchMock).toHaveBeenCalledWith(
    'http://localhost:3001/v1/clustering-results/r1',
    expect.objectContaining({ method: 'DELETE', credentials: 'include' })
  );
});

it('setPhotoLocation POSTs place + point to /photos/:id/location', async () => {
  // why: matches the hand-written gateway route (/photos, no v1) and carries the picked point
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'photo-1' }) });
  vi.stubGlobal('fetch', fetchMock);
  await setPhotoLocation('photo-1', { place: { country: 'France', city: 'Paris' }, lat: 48.85, lon: 2.35 });
  expect(fetchMock).toHaveBeenCalledWith(
    'http://localhost:3001/photos/photo-1/location',
    expect.objectContaining({
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ place: { country: 'France', city: 'Paris' }, lat: 48.85, lon: 2.35 })
    })
  );
});
```

- [ ] **Step 2: Run to confirm RED** — `pnpm --filter @photoops/web test -- lib/api.spec.ts` (Expected: FAIL — functions undefined).

- [ ] **Step 3: Write the stubs**

```typescript
export async function deleteClusteringResult(resultId: string): Promise<void> {
  throw new Error('not implemented');
}
export async function setPhotoLocation(photoId: string, input: { place: { continent?: string; country?: string; region?: string; city?: string; district?: string }; lat?: number; lon?: number }): Promise<PhotoAsset> {
  throw new Error('not implemented');
}
```

- [ ] **Step 4: Confirm still RED + typecheck** — re-run Step 2 (FAIL on behavior). `make typecheck` clean.

- [ ] **Step 5: Commit** — `git commit -m "skeleton(023): web api client delete-run + set-location (RED + stubs)"`

---

### Task 6: web — pure map + histogram logic

**Files:**
- Stub: `apps/web/components/map/points.ts` · Test: `apps/web/components/map/points.spec.ts` (RED)
- Stub: `apps/web/components/clusters/histogram.ts` · Test: `apps/web/components/clusters/histogram.spec.ts` (RED)

**Interfaces:**
- Produces:
  - `collectResultPhotoIds(root: ClusterNode | null): string[]` — all `items` photo-ids across the tree, de-duplicated, in traversal order.
  - `mapPointsFor(ids: string[], photosById: Map<string, PhotoAsset>): { photoId: string; lat: number; lon: number }[]` — only photos present with both `lat` and `lon` (no-coord/absent photos dropped; caller surfaces the "N of M" gap).
  - `binByTime(ids: string[], photosById: Map<string, PhotoAsset>, binCount?: number): { startMs: number; count: number }[]` — bucket photos by taken time (`takenAtUtc ?? takenAtLocal ?? createdAt`) into `binCount` (default 24) uniform buckets across [min,max]; empty when no dated photo.

**GREEN obligation:** implement the three pure fns; 100% covered (they carry the map/histogram behavior the Leaflet glue cannot unit-test). Do not weaken the REDs.

- [ ] **Step 1: Write the RED tests** — `apps/web/components/map/points.spec.ts`:

```typescript
import { collectResultPhotoIds, mapPointsFor } from './points';
import type { ClusterNode, PhotoAsset } from '../../lib/api';

const leaf = (id: string, items: string[]): ClusterNode => ({
  id, kind: 'leaf', mergeDistance: 0, dateFrom: '', dateTo: '', photoCount: items.length,
  coverPhotoId: '', segmentLabel: '', children: [], items
});

it('collectResultPhotoIds flattens all leaf items across the tree', () => {
  // why: map/histogram operate on the WHOLE result's photos, gathered from the tree
  const root: ClusterNode = { ...leaf('root', []), kind: 'root', children: [leaf('a', ['p1', 'p2']), leaf('b', ['p3'])] };
  expect(collectResultPhotoIds(root)).toEqual(['p1', 'p2', 'p3']);
  expect(collectResultPhotoIds(null)).toEqual([]);
});

it('mapPointsFor keeps only photos with both lat and lon', () => {
  // why: no-GPS / beyond-500 photos are dropped from the map (surfaced as "N of M")
  const by = new Map<string, PhotoAsset>([
    ['p1', { lat: 48.85, lon: 2.35 } as PhotoAsset],
    ['p2', { lat: 55.75 } as PhotoAsset],   // no lon → dropped
    ['p3', {} as PhotoAsset]                // absent coords → dropped
  ]);
  expect(mapPointsFor(['p1', 'p2', 'p3', 'p4'], by)).toEqual([{ photoId: 'p1', lat: 48.85, lon: 2.35 }]);
});
```

`apps/web/components/clusters/histogram.spec.ts`:

```typescript
import { binByTime } from './histogram';
import type { PhotoAsset } from '../../lib/api';

it('binByTime buckets photos across the span and prefers takenAtUtc', () => {
  // why: the histogram is per-photo taken-time, uniform bins, utc→local→createdAt fallback
  const by = new Map<string, PhotoAsset>([
    ['p1', { takenAtUtc: '2024-06-15T00:00:00Z' } as PhotoAsset],
    ['p2', { takenAtLocal: '2024-06-15T00:00:00' } as PhotoAsset],  // fallback used
    ['p3', { takenAtUtc: '2024-06-17T00:00:00Z' } as PhotoAsset]
  ]);
  const bins = binByTime(['p1', 'p2', 'p3'], by, 2);
  expect(bins).toHaveLength(2);
  expect(bins.reduce((n, b) => n + b.count, 0)).toBe(3);
  expect(bins[0].count).toBe(2);   // p1,p2 at the low end
  expect(bins[1].count).toBe(1);   // p3 at the high end
});

it('binByTime returns [] when no photo has a time', () => {
  expect(binByTime(['x'], new Map(), 4)).toEqual([]);
});
```

- [ ] **Step 2: Run to confirm RED** — `pnpm --filter @photoops/web test -- components/map/points.spec.ts components/clusters/histogram.spec.ts` (Expected: FAIL — modules missing).

- [ ] **Step 3: Write the stubs** — each exported fn body `throw new Error('not implemented')` with the exact signatures above.

- [ ] **Step 4: Confirm still RED + typecheck** — re-run Step 2 (FAIL on behavior). `make typecheck` clean.

- [ ] **Step 5: Commit** — `git commit -m "skeleton(023): web map+histogram pure logic (RED + stubs)"`

---

### Task 7: web — Leaflet glue (`PhotoMap`, coverage-excluded) + deps

**Files:**
- Stub: `apps/web/components/map/PhotoMap.tsx` (client-only Leaflet glue; view + pick modes)
- Modify: `apps/web/vitest.config.ts` (add the glue to `coverage.exclude`)
- Modify: `apps/web/package.json` + `pnpm-lock.yaml` (`leaflet` + `@types/leaflet`)
- Vendor: `apps/web/public/geo/world-110m.geojson` (Natural Earth 110m countries, text) + `NOTICE`

**Interfaces:**
- Produces: `PhotoMap({ points, mode, onPick }: { points: { photoId: string; lat: number; lon: number }[]; mode: 'view' | 'pick'; onPick?: (lat: number, lon: number) => void }): JSX.Element` — a client-only component (`dynamic(() => import(...), { ssr:false })` boundary) that renders the vendored GeoJSON basemap + `L.circleMarker` per point; in `pick` mode a map click calls `onPick(lat, lon)`.

**GREEN obligation:** implement the Leaflet mount inside `useEffect` (import leaflet dynamically; `L.geoJSON` basemap, **no `tileLayer`**, `L.circleMarker` markers, `map.on('click', e => onPick(e.latlng.lat, e.latlng.lng))`), branch-free. This file has **no unit RED** — it is coverage-excluded and its render/click behavior is verified by the live smoke (Task 10); that absence is the design (spec decision 3), not a gap.

- [ ] **Step 1: Add deps + vendor the basemap** — `pnpm --filter @photoops/web add leaflet && pnpm --filter @photoops/web add -D @types/leaflet`; commit the updated `pnpm-lock.yaml`. Add `apps/web/public/geo/world-110m.geojson` (public-domain Natural Earth 110m, text) + a `NOTICE` (mirror the 022 GeoNames NOTICE pattern).

- [ ] **Step 2: Exclude the glue from coverage** — in `apps/web/vitest.config.ts` add `components/map/PhotoMap.tsx` to `coverage.exclude` (next to the existing `smoke/**` entry), with a comment: `// Leaflet mount — no layout in jsdom; verified by smoke-ui (spec 2026-07-09 decision 3)`.

- [ ] **Step 3: Write the stub**

```tsx
'use client';
import type { PhotoAsset } from '../../lib/api';

export interface PhotoMapProps {
  points: { photoId: string; lat: number; lon: number }[];
  mode: 'view' | 'pick';
  onPick?: (lat: number, lon: number) => void;
}

// Leaflet glue — mounted via dynamic(ssr:false) by the caller. Coverage-excluded
// (jsdom gives no layout); render + click verified by smoke-ui.
export default function PhotoMap(_props: PhotoMapProps): JSX.Element {
  throw new Error('not implemented');  // GREEN: L.geoJSON basemap + circleMarkers + click→onPick
}
```

- [ ] **Step 4: Confirm typecheck + coverage-gate honors the exclude** — `make typecheck` clean (needs `@types/leaflet`). Run `make skeleton-gate` after the web tasks land; confirm `PhotoMap.tsx` does NOT appear as an uncovered file (proves the `coverage.exclude` works — the load-bearing R1 fix).

- [ ] **Step 5: Commit** — `git commit -m "skeleton(023): PhotoMap Leaflet glue (coverage-excluded) + vendored basemap"`

---

### Task 8: web — ClusterView workspace (view switcher + delete action)

**Files:**
- Modify: `apps/web/components/clusters/ClusterView.tsx`
- Stub: `apps/web/components/clusters/Histogram.tsx` (pure SVG bars from `binByTime`)
- Test: `apps/web/components/clusters/ClusterView.spec.tsx` (RED — switcher + delete)

**Interfaces:**
- Consumes: `deleteClusteringResult` (Task 5); `collectResultPhotoIds`/`mapPointsFor` + `binByTime` (Task 6); `PhotoMap` (Task 7, via `dynamic(ssr:false)`); existing `active`/`photosById`.
- Produces: a `view: 'tree' | 'map' | 'histogram'` switcher over the active result; a per-`result-row` delete control. `Histogram({ bins }): JSX.Element` renders one `<rect data-testid="histogram-bar">` per non-empty bin.

**GREEN obligation:** add the `view` state + a switcher (`data-testid="view-switcher"`) that swaps the active-result body between the existing tree, `<PhotoMap mode="view" points=… />`, and `<Histogram bins=… />`; add a delete button per result-row that confirms then `deleteClusteringResult(id)` → refresh list + clear `active` if it was the deleted one. Surface "N of M placed" for the map. Do not weaken the REDs.

- [ ] **Step 1: Write the RED tests** — extend `ClusterView.spec.tsx` (reuse its `vi.mock('../../lib/api')` + `METHODS`/`RESULTS`/`TREE` fixtures; mock `PhotoMap` to a stub that renders its point count so jsdom stays Leaflet-free):

```typescript
it('switches the active result between tree, map and histogram', async () => {
  // why: the workspace is one result viewed three ways (switcher over the whole result)
  renderWithActiveResult();  // existing helper path: select a ready result → tree shows
  await screen.findByTestId('cluster-node');
  fireEvent.click(screen.getByRole('button', { name: /map/i }));
  expect(await screen.findByTestId('photo-map')).toBeInTheDocument();     // mocked PhotoMap
  fireEvent.click(screen.getByRole('button', { name: /histogram/i }));
  expect(await screen.findAllByTestId('histogram-bar')).not.toHaveLength(0);
});

it('deletes a run after confirm and drops it from the list', async () => {
  // why: delete is confirmed (no one-click loss) and the row disappears on success
  vi.mocked(api.deleteClusteringResult).mockResolvedValue(undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  renderWithResults();
  fireEvent.click(within(screen.getByTestId('result-row-r1')).getByRole('button', { name: /delete/i }));
  await waitFor(() => expect(api.deleteClusteringResult).toHaveBeenCalledWith('r1'));
  await waitFor(() => expect(screen.queryByTestId('result-row-r1')).not.toBeInTheDocument());
});
```

> Add a stable `data-testid={`result-row-${r.id}`}` to the result-row (currently `result-row` at `ClusterView.tsx:220`) so a specific row is addressable.

- [ ] **Step 2: Run to confirm RED** — `pnpm --filter @photoops/web test -- components/clusters/ClusterView.spec.tsx` (Expected: FAIL — no switcher, no delete button, no `Histogram`).

- [ ] **Step 3: Write the stubs** — `Histogram.tsx`:

```tsx
export default function Histogram({ bins }: { bins: { startMs: number; count: number }[] }): JSX.Element {
  throw new Error('not implemented');  // GREEN: <svg> with one <rect data-testid="histogram-bar"> per bin
}
```

In `ClusterView.tsx` add `const [view, setView] = useState<'tree'|'map'|'histogram'>('tree')` and the switcher + delete button as inert markup wired to handlers that `throw new Error('not implemented')` (GREEN fills them). Import `PhotoMap` via `dynamic(() => import('../map/PhotoMap'), { ssr:false })`.

- [ ] **Step 4: Confirm still RED + typecheck** — re-run Step 2 (FAIL on behavior). `make typecheck` clean.

- [ ] **Step 5: Commit** — `git commit -m "skeleton(023): ClusterView workspace switcher + delete (RED + stubs)"`

---

### Task 9: web — location editor in `PhotoDetailModal`

**Files:**
- Stub: `apps/web/components/gallery/LocationEditor.tsx` (place fields + `PhotoMap` pick)
- Modify: `apps/web/components/gallery/PhotoDetailModal.tsx` (mount the editor)
- Test: `apps/web/components/gallery/LocationEditor.spec.tsx` (RED)

**Interfaces:**
- Consumes: `setPhotoLocation` (Task 5); `PhotoMap` (Task 7, `mode="pick"`).
- Produces: `LocationEditor({ photoId, onSaved }: { photoId: string; onSaved: (p: PhotoAsset) => void }): JSX.Element` — place-label inputs + a pick map; Save calls `setPhotoLocation(photoId, { place, lat?, lon? })` then `onSaved`.

**GREEN obligation:** render the label fields + `<PhotoMap mode="pick" onPick=… />` (the pick sets `lat/lon` state); Save → `setPhotoLocation` → `onSaved`. Point is optional (label-only allowed). Do not weaken the REDs.

- [ ] **Step 1: Write the RED test** — `LocationEditor.spec.tsx` (mock `lib/api` + a stub `PhotoMap` exposing a "pick here" button that calls `onPick(48.85, 2.35)`):

```typescript
it('saves the typed place plus the picked point', async () => {
  // why: manual location = labels + an optional map-clicked point, sent to setPhotoLocation
  vi.mocked(api.setPhotoLocation).mockResolvedValue({ id: 'photo-1' } as never);
  const onSaved = vi.fn();
  render(<LocationEditor photoId="photo-1" onSaved={onSaved} />);
  fireEvent.change(screen.getByLabelText(/city/i), { target: { value: 'Paris' } });
  fireEvent.click(screen.getByRole('button', { name: /pick here/i }));   // stub PhotoMap → onPick(48.85,2.35)
  fireEvent.click(screen.getByRole('button', { name: /save location/i }));
  await waitFor(() => expect(api.setPhotoLocation).toHaveBeenCalledWith(
    'photo-1', expect.objectContaining({ place: expect.objectContaining({ city: 'Paris' }), lat: 48.85, lon: 2.35 })
  ));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
});
```

- [ ] **Step 2: Run to confirm RED** — `pnpm --filter @photoops/web test -- components/gallery/LocationEditor.spec.tsx` (Expected: FAIL — component missing).

- [ ] **Step 3: Write the stubs** — `LocationEditor.tsx` exports the component with the props above, body renders nothing yet / `throw new Error('not implemented')`; in `PhotoDetailModal.tsx` mount `<LocationEditor photoId={photo.id} onSaved={…} />` near the Location row (`:95-103`) behind the existing loaded state (import only — GREEN wires the refresh).

- [ ] **Step 4: Confirm still RED + typecheck** — re-run Step 2 (FAIL on behavior). `make typecheck` clean.

- [ ] **Step 5: Commit** — `git commit -m "skeleton(023): PhotoDetailModal location editor (RED + stubs)"`

---

### Task 10: live smoke — seed spread + `clusters.smoke.ts` (executable e2e, run GREEN before review)

**Files:**
- Modify: `scripts/lib/photoops-e2e.sh` (`gen_jpeg` accepts lat/lon + time args)
- Modify: `scripts/seed-demo.sh` (seed ≥2 photos at DISTINCT points/times)
- New: `apps/web/smoke/clusters.smoke.ts` (Playwright)

**Interfaces:** consumes the running stack; no code interface. This is the dqb oracle — **not** RED-gated, but MUST run green before the final review (every slice crosses UI-render + HTTP↔gRPC).

**GREEN obligation:** parametrize `gen_jpeg` (it already writes EXIF GPS via piexif — add `lat`/`lon`/`taken_at` params, defaulted to today's values so existing callers are unchanged); seed a user with ≥2 spread photos, run a clustering pass, and drive the workspace. Do NOT depend on the local-only `/home/gss/geo-test-photos`.

- [ ] **Step 1: Parametrize the seed** — `gen_jpeg` gains `lat`/`lon`/`taken_at` optional args (defaults preserve current behavior); `seed-demo.sh` seeds ≥2 photos at distinct points (e.g. Paris + Moscow) and times.

- [ ] **Step 2: Write the smoke** — `apps/web/smoke/clusters.smoke.ts` (mirror `gallery.smoke.ts` sign-in + the seeded user). Assert, against the seeded spread:
  - the workspace tree renders for a ready result;
  - **map**: switch → `page.locator('path.leaflet-interactive')` count ≥ 2 (Leaflet circleMarkers — the real render, not `<circle>`);
  - **histogram**: switch → `svg rect` count ≥ 2;
  - **delete**: delete a run → its row disappears;
  - **set-location**: open a photo, pick a point + type a place, Save → the place-tag surfaces;
  - **IDOR (negative)**: a `POST /photos/<foreign-id>/location` (or the UI equivalent) → `NOT_FOUND`.

- [ ] **Step 3: Run GREEN** — `make smoke-ui` + `make smoke-cluster` against the live stack (rebuild BOTH images per Task 1). Expected: PASS. `make smoke-media` unaffected (no `irf`).

- [ ] **Step 4: Commit** — `git commit -m "skeleton(023): clusters smoke + seed spread (live e2e)"`

---

## Self-Review

**1. Obligation coverage** — every spec obligation maps to a RED (or the documented smoke-only oracle):
- delete soft + NOT_FOUND parity → Task 2 (`test_store`/`test_server`). Immutability (tree untouched) → soft_delete only sets `deleted_at` (no tree write in the stub surface).
- owner-scoped set-location + IDOR → Task 3 unit (`userId` passed to scoped writer; false→not-found) + Task 10 negative smoke (the SQL scope, `4vg`).
- map coords / whole-result / drop-no-coord → Task 6 (`collectResultPhotoIds`, `mapPointsFor`).
- histogram per-photo time + fallback → Task 6 (`binByTime`).
- switcher + delete UI → Task 8; location editor + pick → Task 9.
- Leaflet no-tiles / gate-honesty → Task 7 (coverage.exclude proven in Step 4) + Task 10 render assert.
- proto + cluster-python pin + rebuild-both → Task 1 + Global Constraints.
- 500-cap "N of M" → Task 8 GREEN obligation (surfaced; the drop itself is pinned by `mapPointsFor`).
**2. Skeleton-failure scan** — no TBD/TODO in tests or signatures; every RED has a concrete fixture + expected value; no "similar to Task N" for a signature.
**3. Type consistency** — `setLocationForUser(userId, photoId, {locationId,lat,lon})`, `setPhotoLocation(userId, photoId, place, lat, lon)`, `soft_delete(*, result_id, user_id)->bool`, `mapPointsFor→{photoId,lat,lon}[]`, `binByTime→{startMs,count}[]`, `PhotoMap({points,mode,onPick})` — names identical across the tasks that consume them.
**4. Reviewable size** — ~2 acceptance behaviors per slice + focused pure-logic tests + stubs + the proto diff; the GREEN is absent by design.
**5. No GREEN** — every body is `throw`/`NotImplementedError`; the only real logic shown is fixtures and the `soft_delete` in-memory filter (a fake, not the product path).

## Non-negotiable ordering (skeleton-gate honesty)

Task 1 (contract) → 2/3/4/5 (backends + client, independent) → 6 (pure logic) → 7 (glue+exclude) → 8/9 (UI) → 10 (smoke). Run `make skeleton-gate` after 6–9 land; it must pass (100% on the pure modules; `PhotoMap.tsx` excluded). Then hand the skeleton to human/adversarial review **before** GREEN.
