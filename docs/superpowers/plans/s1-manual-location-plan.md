# ClearPhotoLocation Skeleton — plan (mtt story s1 → task t1)

> Executed under the mtt task flow: task `t1` is authored skeleton→GREEN on branch `task/t1`,
> gated by `make skeleton-gate` → `make gate`+`coverage-gate`+`test-guard`+`smoke-ui` → review → PR → deliver.

**Goal:** Add `ClearPhotoLocation` — remove a photo's manual location — as a vertical slice
proto → photo-service → gateway → web, verified by `make smoke-ui`. Design: `specs/s1-manual-location-design.md`.

**Architecture / WHY:** Explicit clear RPC (not a Set overload). Repo `clearLocationForUser`
nulls `location_id/lat/lon` owner-scoped; service re-reads; gateway `DELETE` route; web "Clear"
button shown only when a location exists. Idempotent; deduped `Location` row left intact.

## Global Constraints

- Proto-first: edit `.proto`, then `make proto`; generated `packages/proto-ts` staged in the same change (proto/CLAUDE.md).
- Owner-scoped writes (like `SetPhotoLocation`); non-owner/unknown → repo false → gateway 404.
- 100% new/changed-code coverage (coverage-gate); no test removed without an `Allow-test-removal:` trailer.

## Non-Goals

- Geocoding (`1vj`), cluster location (`9jv`), orphan-Location GC, undo/history, bulk clear.

---

### Task A — proto contract

- **Files:** `proto/photo/v1/photo_service.proto` (add rpc + request); regenerate `packages/proto-ts/**`.
- **RED:** contract-level — the generated `PhotoServiceClient` type has no `clearPhotoLocation` until the rpc exists (typecheck in downstream tasks is the failing signal). `make proto-check` (part of `make gate`) must show generated output in sync.
- **Stub:** `rpc ClearPhotoLocation(ClearPhotoLocationRequest) returns (PhotoAsset) { option (google.api.http) = { delete: "/v1/photos/{photo_id}/location" }; }`; `message ClearPhotoLocationRequest { string photo_id = 1; string user_id = 2; }`.

### Task B — photo-service repo + service

- **Files:** `apps/photo-service/src/photo/photo.service.ts` (+ repo interface), `…/photo.service.spec.ts` (RED), repo impl + its spec.
- **RED tests (photo.service.spec.ts):**
  - `clearPhotoLocation` calls `repository.clearLocationForUser(userId, photoId)` and returns the re-read photo with `lat/lon` null and no `location`.
  - owner scope: when the repo returns `false` (not found/not owner), the service surfaces not-found (throws / returns null per existing convention) — mirror `setPhotoLocation`'s not-found path.
  - idempotent: repo `true` on an already-cleared row still returns the photo.
- **Stubs:**
  - repo iface: `clearLocationForUser(userId: string, photoId: string): Promise<boolean>` (`raise NotImplemented` equivalent — throws until GREEN).
  - `async clearPhotoLocation(userId: string, photoId: string): Promise<PhotoWithVariants> { throw new Error('NotImplemented'); }`

### Task C — photo-service gRPC controller

- **Files:** `…/photo.grpc.controller.ts`, `…/photo.grpc.controller.spec.ts` (RED).
- **RED:** `ClearPhotoLocation` handler maps request → `service.clearPhotoLocation` → `PhotoAsset` (lat/lon absent, location absent); not-found → gRPC NOT_FOUND (mirror SetPhotoLocation).
- **Stub:** `async clearPhotoLocation(req): Promise<PhotoAsset> { throw new Error('NotImplemented'); }`

### Task D — gateway client + DELETE route

- **Files:** `apps/api-gateway/src/grpc/photo.client.ts`, `…/http/photo.controller.ts`, `…/http/photo.controller.spec.ts` (RED).
- **RED tests (photo.controller.spec.ts):**
  - `DELETE /v1/photos/:photoId/location` calls `photoClient.clearPhotoLocation(photoId, userId)` with the session user and returns the mapped photo.
  - not-owner/unknown (client throws NOT_FOUND) → HTTP 404.
- **Stubs:** client `clearPhotoLocation(photoId, userId): Promise<PhotoAsset>`; controller `@Delete(':photoId/location') clearLocation(...)`.

### Task E — web api client + LocationEditor button

- **Files:** `apps/web/lib/**` api client (mirror the set-location client fn), `apps/web/components/gallery/LocationEditor.tsx`, `…/LocationEditor.spec.tsx` (RED).
- **RED tests (LocationEditor.spec.tsx):**
  - when the photo has a location, a "Clear location" control renders; activating it calls `clearPhotoLocation(photoId)` and invokes the parent's refetch/`onCleared`.
  - when the photo has no location, the Clear control is absent.
- **Stubs:** api `clearPhotoLocation(photoId: string): Promise<PhotoAsset>`; a `<button>` wired to a handler that throws until GREEN.

### Task F — executable e2e (smoke-ui)

- **Files:** extend the 023 location Playwright flow in `scripts/smoke-ui.sh` / its spec.
- **RED→GREEN:** set a location, assert it renders; clear it, assert labels + map marker disappear; reload, assert still cleared. Run green before final review (dqb gate selects `smoke-ui` because `apps/web/**` changed).

## Skeleton→GREEN order

A (proto) → B (service) → C (grpc) → D (gateway) → E (web) → F (smoke). Each layer's RED test is
written first and committed as part of the skeleton; `make skeleton-gate` must pass before the
human skeleton-review; GREEN fills the stubs until `make gate`+`coverage-gate`+`smoke-ui` pass.
