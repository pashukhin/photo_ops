# Design: clear/unset a photo's manual location (mtt story s1)

- **Story:** mtt `s1` "manual location editing" · **Pilot child:** `ClearPhotoLocation`
- **Status:** authored under the mtt flow (session 026 pilot). Follows session 023's
  set-only `SetPhotoLocation` (9q4.3), which deferred removal (beads `zvc`).
- **Tracker:** mtt (pilot). The beads twin `zvc` is neutralized at the go-gate.

## Context

Session 023 shipped `SetPhotoLocation` (manual place + optional point), but it is **set-only**:
`PhotoRepository.setLocationForUser` requires a non-null `locationId`, so once a photo has a
manual/geocoded location there is no way to remove it. This story adds the removal path.

## Decision — an explicit `ClearPhotoLocation` RPC (not an overload of Set)

Clearing is a **separate RPC**, not `SetPhotoLocation` with empty inputs. This sidesteps the
null-vs-absent ambiguity 023 flagged: "set" always means "there is a location"; "clear" always
means "there is none." No sentinel/empty-place overloading.

- **proto** (`proto/photo/v1/photo_service.proto`): add
  `rpc ClearPhotoLocation(ClearPhotoLocationRequest) returns (PhotoAsset)` mapped to
  `DELETE /v1/photos/{photo_id}/location`; `ClearPhotoLocationRequest { string photo_id = 1;
  string user_id = 2; }`. Regenerate `packages/proto-ts` via `make proto`.
- **photo-service**:
  - repo: add `clearLocationForUser(userId, photoId): Promise<boolean>` — sets
    `location_id = NULL, lat = NULL, lon = NULL` **scoped to the owner**; returns whether a row
    was updated (false = not found / not owner). The deduped `Location` row is **left intact**
    (Locations are shared/deduped; clearing only unlinks this photo).
  - service: `clearPhotoLocation(userId, photoId): Promise<PhotoWithVariants>` — calls the repo
    clear, then re-reads and returns the photo (now location-absent). **Idempotent**: clearing
    an already-cleared photo succeeds and returns the photo (no error).
  - grpc controller: `ClearPhotoLocation` handler → `PhotoAsset` (lat/lon absent, `location`
    absent).
- **gateway** (`apps/api-gateway`):
  - `photo.client`: `clearPhotoLocation(photoId, userId)` gRPC call.
  - `photo.controller`: `DELETE /v1/photos/:photoId/location` — owner from the auth session,
    returns the updated `PhotoAsset`; not-found/not-owner → 404.
- **web** (`apps/web`):
  - api client: `clearPhotoLocation(photoId)` → `DELETE`.
  - `LocationEditor.tsx`: a **"Clear location"** affordance, shown only when the photo currently
    has a location; on click it clears and the parent refetches → the marker/labels disappear.

## Invariants / edge cases (each pinned by a RED test)

1. Clearing removes the link and the point: after clear, the photo's `lat/lon` are absent and
   `location` is absent.
2. **Owner scope:** a non-owner (or unknown photo) clear updates nothing → repo returns false →
   gateway 404. A user cannot clear another user's photo.
3. **Idempotent:** clearing a photo that has no location succeeds (returns the photo), does not
   error.
4. The deduped `Location` row is **not** deleted (still resolvable for other photos).
5. The Clear affordance is **absent** when the photo has no location (nothing to clear).

## e2e scenario (executable — `make smoke-ui` on a live stack)

> **Given** an authenticated user with a photo that has a manual location set (place labels +
> map point), **when** they open the photo detail modal, **then** the location editor shows the
> place + a "Clear location" control. **When** they activate "Clear location", **then** the
> request succeeds, the modal re-reads the photo, and the location (labels + map marker) is gone;
> re-opening confirms the location stays cleared. A photo with no location shows no Clear control.

This is added to `make smoke-ui` (extends the 023 location-editor Playwright flow): set a
location, assert it renders, clear it, assert it disappears.

## Non-goals

- Reverse/forward geocoding of a clicked point (beads `1vj`), cluster-level location (`9jv`).
- Deleting/garbage-collecting orphaned `Location` rows (they are deduped and shared by design).
- Undo/history of location changes.
- Bulk clear across photos.
