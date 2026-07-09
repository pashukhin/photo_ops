# Cluster workspace + manual location (9q4.2 / 9q4.3) — design note (exSDD lane)

Date: 2026-07-09 · Issues: `photo_ops-9q4.2` (workspace) + `photo_ops-9q4.3`
(manual location) · Branch: `session-023-cluster-location`

> **Why thin.** Executable-spec lane (agent-workflow-evolution Decision 1). The real
> spec is the RED tests + the proto/schema contracts + the live `smoke-ui`/`smoke-cluster`
> assertions; this note is intent + settled decisions + layer-routing + entry-points
> only — not a prose twin (Principle 7). Durable *why* for the map lands in ADR-0008.

## Intent

Turn the clustering surface from "a tree + Generate" into a real **workspace**, and
add **manual location** on top of the 022 `Location` model:

- **9q4.2** — **delete** a run; **view** a result three ways: the immutable tree
  (exists), a **map** of the result's photos, a **time histogram**.
- **9q4.3** — **set a location** on a **photo** (from the detail modal), capturing a
  **point** (map-click) + place labels, written through the same 022 dedup table.

Stage 5/8 of the roadmap; first of two P1 release-readiness feature sessions. The
demo gates on this (`9q4`).

## Settled decisions (brainstorm 2026-07-09 + 3-way adversarial review)

Three adversarial reviewers (architecture · scope/YAGNI · feasibility) verified the
draft against the code; all returned **FIX-THESE** (boundaries/immutability/dedup
sound, but gate-friction + two feature-coherence holes + one must-fix IDOR). The
decisions below fold in their findings.

1. **Map/histogram are pure web-side joins — zero cluster-service change for viewing.**
   `ClusterView` already loads `listPhotos({pageSize:500,status:['ready']})` into an
   `id→PhotoAsset` map (`ClusterView.tsx:144`), and `PhotoAsset` already carries
   `lat`/`lon` + `takenAt*` on the wire (`lib/api.ts:28-29,22-23`; gateway passthrough
   `photo.controller.ts:88-95`). The active result's tree gives `photo_id`s (leaf
   `ClusterItem`s). Map/histogram = flatten the tree's photo_ids → join `photosById` →
   project/bin. The switcher operates on the **whole result** (`ClusterView` has no
   "selected node" concept; `active` = the whole `ClusteringResult`, `:106,:231`).

2. **Map coordinate source = exact `photo_assets.lat/lon`. No `irf`, no hybrid.**
   A geocoded place exists only if the photo had GPS → `photo.lat/lon` is populated
   exactly when `location` is; a `location.lat/lon` fallback would help *only*
   manually-located no-GPS photos. We give those a point directly (decision 6), so the
   fallback is never needed. **`irf` (typed `lat/lon` on proto `GeoPlace`) is dropped
   from this session** — it has no consumer → **no `GeoPlace` proto change**, so the
   media-worker geocoder is untouched (its Python `643` risk stays out). *(Both the
   architecture and feasibility reviewers independently reached this; the map's coord is
   already E2E today.)* Note: the two RPCs we DO add still regen **cluster-service's**
   Python client stubs — see the proto step + `643` under Layer-routing.

3. **Map renders with the Leaflet *library* + a self-hosted *vector* basemap, not
   external tiles.** Durable rationale → **ADR-0008**.
   - *Why not embedded Google/OSM tiles (the "reuse a ready map" instinct):* the
     browser hitting `maps.googleapis.com` / `tile.openstreetmap.org` violates the
     **`web talks only to api-gateway`** invariant (`apps/web/CLAUDE.md`,
     `docs/architecture.md`) by construction; Google needs a key + ToS + network
     (kills the keyless/offline Docker demo — same reason ADR-0007 rejected external
     Nominatim); OSM's tile policy forbids app load without a self-hosted multi-GB
     tile server (disproportionate). Brief fork #1: "no external calls from the page."
   - *The reused wheel is Leaflet-the-widget* (pan/zoom, projection, `click→latLng`,
     markers) fed a **vendored world-countries GeoJSON** via `L.geoJSON` (text,
     Natural Earth 110m, ~150 KB, under `apps/web/` + a NOTICE) with **no `tileLayer`**
     → zero external calls, invariant intact. Points are `L.circleMarker` (SVG) — **no
     `L.marker`/`L.Icon.Default`** (their default-icon PNGs are the only external
     `url()` in `leaflet.css`; circleMarker sidesteps them). Add `leaflet` +
     `@types/leaflet` to `apps/web` deps.
   - *Gate-honesty (the reviewers' main objection — Leaflet is 0×0 / no markers in
     jsdom):* split into (i) a **pure-logic module** tested to 100% in jsdom —
     `collectResultPhotoIds(tree)`, `mapPointsFor(ids, photosById)`, `fitBounds` input, a
     pure `onPointPicked(lat, lon) → SetPhotoLocation payload`; projection and the click's
     `e.latlng` are **Leaflet's** job — and (ii) a **separate thin glue file** that mounts
     Leaflet (init, `L.geoJSON`, circleMarkers, wire click → `onPointPicked`) behind
     `dynamic(..., {ssr:false})`, branch-free. **The glue file is added to
     `vitest.config.ts` `coverage.exclude`** (the mechanism already excluding
     `smoke/**`) — an inline `/* c8 ignore */` alone is **not** enough because vitest
     `coverage.all:true` globs the whole project and scores an unmounted
     `dynamic(ssr:false)` shell at 0 hits (verified: R1); keep the inline pragma as
     in-file documentation. This is the JS analogue of the Python `# pragma: no cover`
     real-IO-adapter pattern (cluster-service/media-worker) — a new but principled
     `apps/web` precedent, recorded in `apps/web/CLAUDE.md`. The glue must **not mount in
     jsdom** (a real `L.map()` on a 0×0 container can throw) — component tests assert only
     the container; the **live `smoke-ui` (Playwright/Chromium) is the honest render
     test** (asserts `path.leaflet-interactive` + a click places a point). Caveat: that
     render check is **not gate-enforced** (smoke ∉ CI) — a broken mount ships green once
     the glue is coverage-excluded, so run `make smoke-ui` before merge.
   - *Leaflet + Next 15 SSR:* Leaflet touches `window` at import → **must** be a
     deferred/client-only import (`useEffect` + `await import('leaflet')`, or
     `dynamic(..., {ssr:false})` inside a client component) or `next build` crashes.
     Never import leaflet in an SSR-reachable module.

4. **Histogram = hand-rolled inline SVG bars, web-side.** Bin per-photo taken time
   (`takenAtUtc → takenAtLocal → createdAt` fallback) over ~N uniform buckets across
   the result's span; a pure binning fn (jsdom-tested), thin SVG render. No new dep,
   no charting lib, no backend. Renders natively in jsdom → honest RED + 100% coverage.

5. **Delete-run = soft-delete over the existing seam; immutability intact.**
   `clustering_results.deleted_at` already exists (`migrations/0001…sql:25`, ADR-0005
   §5 seam) and is **already read-filtered** by `get`/`list_for_user`
   (`store_postgres.py:109,146`) — only the **write** path is missing. Add
   `Store.soft_delete` (`UPDATE … SET deleted_at=now() WHERE id AND user_id AND
   deleted_at IS NULL RETURNING id`) → **`NOT_FOUND` when 0 rows** (parity with
   `GetClusteringResult`, not a blind 200), a `DeleteClusteringResult` RPC, a gateway
   `DELETE` route, a web action. **The `InMemoryStore` fake (used by the RED test) is
   NOT yet delete-aware** — add a deleted flag to `StoredResult`, read-filter it in
   `InMemoryStore.get`/`list_for_user`, and `soft_delete` to the `Store` Protocol + both
   impls (the "only the write path is missing" holds for `PostgresStore`, not the fake).
   Soft-delete mutates only `deleted_at` — **not** the
   immutable node/item tree (no ADR-0005 violation, no FK cascade). Restore ops stay
   deferred (seam). *Posts are safe:* a post snapshots node membership into
   `post_photos` at creation (immutable — domain-model §Post) → soft-deleting the run
   does not orphan existing posts; a provenance re-fetch of the source result would
   404, but no live path re-fetches (verify during implementation).

6. **Manual photo-location writes a point to `photo_assets.lat/lon` + a label via the
   022 dedup table — owner-scoped.** New photo-service RPC
   `SetPhotoLocation(photo_id, user_id, GeoPlace place, optional double lat, optional
   double lon) → PhotoAsset`:
   - **Owner-scoped write (must — fixes a latent IDOR):** the existing
     `applyAttributes`/`setStatus` are deliberately **unscoped** (internal-only,
     `photo.repository.ts:159,206`) — do **not** reuse them. Add an owner-scoped
     writer (`… WHERE id=$photoId AND user_id=$userId`) mirroring `findByIdForUser`.
     Verified two ways (photo-service has **no in-process DB** — `4vg`): a unit RED that
     the **service passes the caller's `userId` to the scoped writer** (fake repo), and a
     **negative live smoke** (a foreign `photo_id` → `NOT_FOUND`); the `WHERE user_id` SQL
     itself is smoke-only.
   - `normalizePlace(place)` → `upsertLocation({…place, lat, lon,
     rawProviderData:{"source":"manual"}})` → `location_id`; set
     `photo_assets.{location_id, lat, lon}` (lat/lon only when a point was captured). On
     tuple-collision the existing no-op `onConflictDoUpdate` keeps the row's point (no
     cross-photo poisoning — verified). Return the updated `PhotoAsset` (compose
     `location` via `listLocationsByIds`, like `getPhoto`).
   - **Set-only this session; clearing/unsetting a location is out of scope** (follow-up)
     — no implementer guessing.
   - **`photo_assets.lat/lon` semantics broaden** to "the photo's known point: EXIF GPS
     **or** a manual override" (documented trade-off). Point is **optional**: a
     label-only set applies the tag but leaves the photo off the map (graceful degrade).
   - **Coordinate capture = map-click:** the map component is reused in a **pick mode**
     inside `PhotoDetailModal` (click → `latLng` → lat/lon). This is why the map and
     the manual location **compose** — the same surface views and places points.

7. **The location control is a plain inline control with ONE consumer — not "shared".**
   Grep confirms **no existing "set location on photo" path** (only unrelated
   `post.location_label` caption). Cluster-level location is **deferred** (decision 8),
   so the control has exactly one caller (`PhotoDetailModal`). The brief's
   "dedupe into one shared control" language is stale — build a plain inline control.

8. **Cluster-level manual location is DEFERRED (Q3).** The immutable-result override
   subsystem (a cluster→location annotation) is the heaviest, least-reused part and
   not needed for a coherent demo (per-photo locations + the map + `Post.location_label`
   cover the place story). New follow-up bead. No immutable-override ADR this session.

## Slices + skeleton-first order

RED-first, each slice self-contained so `make skeleton-gate` sees an honest covering
RED test per new behavior. Proto edits touch two `.proto` files; `make proto` regens
`packages/proto-ts` **and** the cluster-service Python client stubs (commit both).

1. **Delete-run.** RED: cluster-service `soft_delete` removes the run from
   `list_for_user`/`get` (Python, against a now delete-aware `InMemoryStore` fake) +
   `NOT_FOUND` on 0 rows; gateway `DELETE` route (nest test); web `deleteClusteringResult`
   action (jsdom — confirm + refresh + clear-active). Proto: `cluster_service.proto`
   `DeleteClusteringResult`.
2. **Manual photo-location.** RED: photo-service `SetPhotoLocation` service orchestration
   (passes `userId` to the scoped writer + `upsertLocation`, fake repo) (TS); gateway
   route; web control renders + pick sets coords + calls `setPhotoLocation` + refresh.
   Proto: `photo_service.proto` `SetPhotoLocation`.
3. **Map view.** RED: pure `collectResultPhotoIds(tree)` + `mapPointsFor(ids, photosById)`
   return N points for N coord-bearing photos + `onPointPicked` payload; the view-switcher
   renders the map container. Leaflet glue in its own file, added to `coverage.exclude`.
   Vendor the GeoJSON + NOTICE + add `leaflet`/`@types/leaflet` (commit `pnpm-lock.yaml`).
4. **Histogram view.** RED: pure `binByTime(ids, photosById)` returns expected bins;
   switcher renders `<rect>` bars.
5. **Smokes last** — against a decided seed (below), green before merge.

## Layer routing / entry points

- **proto** (`make proto` → stage `packages/proto-ts` **and** the regenerated
  `apps/cluster-service/src/photoops_proto/{cluster,photo}/v1` Python stubs — both our
  RPCs regen them since cluster-service is a `photo/v1` client; `proto-check` diffs that
  dir, so committing it is required. `buf.gen.cluster-python.yaml` is unpinned (`643`) →
  **pin it in this PR** to avoid a CI/local plugin-float mismatch on `proto-check`.
  **Rebuild BOTH images** the changed RPC touches — restart drops new fields as unknown):
  - `proto/cluster/v1/cluster_service.proto` — `DeleteClusteringResult` (+ `delete:`
    HTTP `/v1/clustering-results/{result_id}`). Rebuild **cluster-service + gateway**.
  - `proto/photo/v1/photo_service.proto` — `SetPhotoLocation` (annotation
    `post: /v1/photos/{photo_id}/location`, sibling-consistent but **decorative** — the
    hand-written gateway route is authoritative: `@Post(':photoId/location')` on
    `@Controller('photos')` → **`/photos/:id/location`**, unlike the cluster
    `@Controller('v1')`). Rebuild **photo-service + gateway**.
- **cluster-service** (`apps/cluster-service`, Python): `store.py` port +
  `store_postgres.py` `soft_delete` (+ in-memory fake); `server.py` handler
  (`NOT_FOUND` parity `:94`).
- **photo-service** (`apps/photo-service`, TS): owner-scoped location writer in
  `photo.repository.ts` (new, not `applyAttributes`); `photo.service.ts` orchestrates
  `normalizePlace`→`upsertLocation`→write→compose reply; grpc controller handler.
- **api-gateway** (`apps/api-gateway/src/http`, TS): `cluster.controller.ts`
  `@Delete('clustering-results/:resultId')` (controller is `@Controller('v1')`) +
  `cluster.client.ts` method; `photo.controller.ts` `@Post(':photoId/location')`
  (controller is `@Controller('photos')` → `/photos/:id/location`; **not**
  `@Post('photos/…')`, which would double to `/photos/photos/…`) + `photo.client.ts`
  method. Both `requireSession` → owner scope (no IDOR).
- **web** (`apps/web`): `lib/api.ts` `deleteClusteringResult` (first DELETE) +
  `setPhotoLocation` (POST); `components/clusters/ClusterView.tsx` view-switcher
  (tree|map|histogram) at `:231-233` + delete button per `result-row` `:216`;
  `components/map/` (new: pure-logic module + a **separate coverage-excluded** Leaflet
  glue file, view+pick modes); `components/gallery/PhotoDetailModal.tsx` location control
  (`:95-103`/footer); vendored `public/…/world-110m.geojson` + NOTICE; add
  `leaflet`+`@types/leaflet` and **commit `pnpm-lock.yaml`**.
- **docs:** ADR-0008 (map); update `apps/web/CLAUDE.md` (the `coverage.exclude` glue
  precedent + map/switcher/location context) and `apps/photo-service/CLAUDE.md` + a note
  on ADR-0007 §4 (`photo_assets.lat/lon` may now be a manual override, not only
  EXIF/geocoder-derived).

## Pinned under-specs (reviewer-flagged)

- **Switcher scope:** whole **result** (all photo_ids across the tree's `ClusterItem`s),
  not a node.
- **500-cap:** map/histogram inherit `listPhotos(pageSize:500)` → surface "showing N of
  M placed / M total", never silently drop (misleading for map/histogram vs thumbnails).
- **Delete confirmation:** explicit confirm (Radix `Dialog` or native `confirm`) — no
  one-click data loss.
- **Location control:** place-label fields + a map-pick point; point optional (label-only
  degrades to off-map tag); no auto reverse-geocode of the clicked point (follow-up).
- **Reprocess-revert (latent, `4uj`):** a future `PROCESSING_TYPE_REPROCESS` would
  overwrite manual `location_id`/`lat`/`lon` (finalize writes unconditionally). No live
  path today (seam) → note in the winner-gate comment + a follow-up.

## Verification (dqb — every slice crosses UI-render + HTTP↔gRPC)

- **Unit tests** (jsdom for web · node-vitest for TS services · pytest for
  cluster-service): switcher toggle; map pure logic (`collectResultPhotoIds`,
  `mapPointsFor`, `onPointPicked`); histogram `binByTime`; delete action
  (confirm+refresh); location control (render + pick + call); photo-service
  `SetPhotoLocation` **service orchestration via a fake repo** (passes `userId` to the
  scoped writer + `upsertLocation` + composes reply — the `WHERE user_id` SQL is
  smoke-only, `4vg`); cluster-service `soft_delete` (filter + `NOT_FOUND`, delete-aware
  `InMemoryStore`); gateway routes.
- **Live `make smoke-ui` (Playwright)** — extend against a seeded user with a **ready
  cluster + photos at DISTINCT GPS points and times**. The current seed is degenerate
  (`gen_jpeg` in `scripts/lib/photoops-e2e.sh:44-50` hardcodes ONE Buenos Aires point;
  `seed-demo.sh:54-55` uploads two at it 5 min apart → markers stack / 1-bin histogram).
  **Fix self-contained: parametrize `gen_jpeg` with lat/lon+time args (it already writes
  EXIF GPS via piexif) and seed ≥2 distinct points/times** — do NOT depend on the
  local-only `/home/gss/geo-test-photos` (absent on CI/other machines). Assert (over the
  distinct points): tree renders; switch → map shows ≥2 **`path.leaflet-interactive`**
  markers; switch → histogram shows ≥2 `rect` bars; delete a run → its row disappears;
  set a location via the picker → it surfaces; a foreign `photo_id` set-location →
  `NOT_FOUND` (the IDOR check). `smoke-ui` is local-only (∉ CI) → run it green before
  merge; it is the sole map-render verifier.
- **`make smoke-cluster`** (existing) green; **`make smoke-media`** unaffected (no `irf`).
- **`make gate` + `make coverage-gate` (100% new code) + `make test-guard`**; final
  `/code-review`. Vendored GeoJSON is **text** → `test-guard`/`a5k` not triggered; commit
  **no** binary (no leaflet dist PNG, no raster basemap).

## ADRs / follow-ups

- **ADR-0008 (new):** offline CSP-safe map — Leaflet library + vendored vector GeoJSON
  basemap (no external tiles), coordinates from the photo domain, coverage via
  pure-logic split + `c8-ignore`d glue + live-smoke render. Durable (preserves the
  web↔gateway-only boundary; reusable pattern).
- **Deferred/open beads:** cluster-level manual location (new); auto reverse-geocode of a
  manually clicked point (new); location clearing/unset (new); `irf` (evaluated, dropped —
  no consumer this session); reprocess-revert of manual location (relates `4uj`).
  **`643` is now in-scope** — our proto edits regen cluster-service Python stubs, so pin
  `buf.gen.cluster-python.yaml` here (media-worker/`GeoPlace` untouched). `a5k` untouched
  (vendored GeoJSON is text — no binary committed).
