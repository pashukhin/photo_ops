# ADR 0008 — Offline, CSP-safe cluster map (Leaflet + vendored vector basemap)

Date: 2026-07-09 · Status: accepted · Session: 023 (`photo_ops-9q4.2`)

Context: session 023 turns the clustering surface into a workspace with a **map** of a
result's photos (+ a time histogram + delete). The map must render on a page that, by a
durable invariant (`docs/architecture.md`, `apps/web/CLAUDE.md`), talks **only to
api-gateway** (except presigned MinIO) — no external calls — and the demo runs on a
keyless, offline Docker stack. This ADR records the durable *why*; the contracts live in
`proto/{cluster,photo}/v1/*`, the behavior in the component + pure-logic tests, and the
acceptance path in `scripts/smoke-clusters.sh` + `apps/web/smoke/clusters.smoke.ts`.
Design + plan: `docs/superpowers/{specs,plans}/2026-07-09-cluster-workspace-and-location*`.

## Decisions

1. **Map coordinates come from the photo domain (`photo_assets.lat/lon`), joined
   web-side — no cluster-service change for viewing.** The immutable cluster tree carries
   only `photo_id`s (ADR-0005); the web app already loads the user's ready photos
   (`listPhotos`, 500-cap) for thumbnails, and each `PhotoAsset` carries `lat/lon`. The map
   (and histogram) are pure joins: flatten the result's tree `photo_id`s × `photosById`.
   *Rejected — persisting coords onto the tree:* violates result immutability and
   duplicates photo-domain truth. *Rejected — `irf` (typed `lat/lon` on `GeoPlace`):* the
   map reads the photo's own coords, which are already on the wire, so `irf` has no
   consumer here (kept deferred). A **manual** location writes the clicked point to
   `photo_assets.lat/lon` (ADR-0007 amendment), so a no-GPS photo still appears on the map
   through the same source — the map and manual location **compose** without `irf`.

2. **Render with the Leaflet *library* + a self-hosted *vector* basemap — never external
   tiles.** *Rejected — Google Maps / OSM tiles:* the browser hitting
   `maps.googleapis.com` / `tile.openstreetmap.org` violates the web↔gateway-only
   invariant by construction; Google needs a key + ToS + network (kills the keyless
   offline demo — the same reason ADR-0007 rejected external geocoding); OSM's tile policy
   forbids app load without a self-hosted multi-GB tile server. The reused wheel is
   Leaflet-the-widget (pan/zoom, projection, `click→latLng`) fed a **vendored Natural
   Earth 110m world-countries GeoJSON** (`apps/web/public/geo/`, public domain + NOTICE)
   via `L.geoJSON`, with **`L.circleMarker` points and NO `tileLayer`** → zero external
   calls. `L.map()` **must** be given an initial `setView` before adding layers/`fitBounds`
   (leaflet has no projection otherwise — a live-smoke-caught bug).

3. **The map is coverage-excluded glue verified by a live smoke; all logic is pure and
   100%-covered.** Leaflet needs real layout, so it cannot render in jsdom. The component
   `components/map/PhotoMap.tsx` is a thin, branch-free Leaflet mount (leaflet imported
   inside `useEffect` → SSR-safe static import; a `clientHeight` guard makes it a jsdom
   no-op) added to `vitest.config.ts` `coverage.exclude` — the JS analogue of the Python
   `# pragma: no cover` real-IO-adapter pattern (cluster-service/media-worker). All testable
   map/histogram logic (`collectResultPhotoIds`, `mapPointsFor`, `binByTime`) lives in pure
   modules tested to 100% in jsdom; the actual Leaflet render + the manual-location pick are
   verified by `smoke-clusters` (Playwright asserts `path.photo-marker` markers). *Rejected —
   a hand-rolled SVG scatter:* would be jsdom-native but reinvents pan/zoom/projection; the
   library is the wheel, and the live smoke + pure-logic split keep it gate-honest.

## Non-goals (seams / deferred)

External map tiles / a self-hosted tile server; a slippy raster basemap; drawing regions
or editing geometry; cluster-level location (deferred — per-photo locations + the map +
`Post.location_label` cover the place story); `irf` (typed `GeoPlace.lat/lon` — no consumer
this session); auto reverse-geocode of a manually clicked point; `>500` photos per result on
the map/histogram (capped, surfaced as "N of M placed"). space-time clustering (`2xu`).
