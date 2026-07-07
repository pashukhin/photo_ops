# ADR 0007 — Geo-normalization: offline reverse-geocoding for display

Date: 2026-07-07 · Status: accepted · Session: 022 (`photo_ops-3iy`)

Context: session 022 turns photo GPS coordinates into human-readable places and
stands up the `Location` model in the photo domain — the seam session 023 builds
on (cluster **map** `9q4.2` reads it; **manual location** `9q4.3` writes the same
shape). This ADR records the durable *why*; the contracts live in
`proto/photo/v1/*` (`GeoPlace`), the schema in
`apps/photo-service/migrations/0003_location.sql`, the behavior in the Python +
TS test files, and the acceptance path in `docs/e2e-geo-normalization.md`. Method:
executable-spec / skeleton-first SDD; design + plan under
`docs/superpowers/{specs,plans}/2026-07-07-geo-normalization*`.

## Decisions

1. **Geocoding is added for DISPLAY / labels, not for clustering.** ADR-0005 §9
   closed reverse-geocoding *for the clustering metric* ("place enters via
   coordinates through the haversine metric"); that still holds. This ADR does not
   reopen it — it adds geocoding for a different purpose: human-readable place
   tags in the gallery now, and the shared `Location` model the cluster map + manual
   location editing consume in 023. Space-time clustering remains a separate seam
   (`2xu`); geocoding does not unlock it.

2. **Reverse-geocoding runs OFFLINE in `media-worker`, not photo-service or an
   external API.** The worker already extracts `lat`/`lon` during processing, so
   the place travels in the result message (`ImageAttributes.place`). *Rejected —
   external API* (Nominatim/Google): a network dependency + key + rate-limit +
   non-determinism, and the §3.4 fallback ("geocoder unavailable → keep
   coordinates, continue") demands offline-tolerance regardless; an external
   crawler also cannot reach a local MinIO in the demo. Offline is deterministic,
   key-free, and reproducible in tests.

3. **Provider = a vendored GeoNames extract + a pure-python nearest-neighbour; no
   scipy/numpy.** *Principle-1 justification:* the maintained wrapper libraries
   (`reverse_geocode`, `reverse_geocoder`) both hard-depend on scipy
   (`from scipy.spatial import cKDTree`), an unwanted weight add to the
   deliberately-lean worker image given the repo's disk/ENOSPC sensitivity. Their
   only real value — a fast *batch* KD-tree — is moot at one photo per message, so
   we **reuse the GeoNames dataset** (not reinventing data) and hand-roll a ~30-line
   equirectangular NN over `cities15000` (`apps/media-worker/src/media_worker/
   geocode.py` + `data/`, CC-BY 4.0, `data/NOTICE`). Region name comes from
   `admin1CodesASCII`, country name + continent from `countryInfo` (continent from
   the provider, not a hand-maintained map — Principle 7). `district` is not
   resolvable at city granularity → stored `''` (manual `9q4.3` fills it), so the
   tag renders `country / region / city`, not the full five-level §3.4 example.

4. **`Location` is owned by `photo-service` (`photo-db`), deduped by the normalized
   place tuple.** Entities: `locations` (`id`, `continent/country/region/city/
   district`, `lat/lon`, `raw_provider_data`, `created_at`) + `photo_assets.
   location_id` (an in-DB FK — same DB, same owner — not a cross-service ref). The
   tuple columns are **`NOT NULL DEFAULT ''`** with a `UNIQUE` over all five, so the
   dedup key actually fires: Postgres treats NULL as *distinct*, so nullable columns
   would silently never dedup. The upsert is one round-trip (`INSERT … ON CONFLICT
   (…5 cols…) DO UPDATE … RETURNING id`). Normalization is `trim` + `null→''` with
   **no lower-casing** — all 022 places are geocoded (casing consistent) and the
   display must stay human-readable (`Buenos Aires`); case-insensitive dedup only
   matters once `9q4.3` adds hand-typed entries, which can add a `lower()` functional
   index then. `Location.lat/lon` = the matched city's representative point (parsed
   from `raw_provider_data`), not the photo's exact coords (those stay on
   `photo_assets`). Manual `9q4.3` inserts the same shape → converges by tuple.
   *Rejected — dedup by rounded coordinates:* buckets don't align with named places
   (one city → many rows, label duplication) and a manual entry without precise
   coords never converges with a geocoded one.

5. **The `Location` table IS the geocoding cache.** §3.4 requires caching. For an
   *offline* provider there is no network cost, so the deduped `locations` table is
   the durable cache/reference the domain model calls for — **no** separate
   per-coordinate cache is added (recorded here so a future reader does not bolt one
   on).

6. **Fallback is total: no GPS or any lookup error → coordinates preserved,
   processing continues.** `reverse_geocode` validates inputs and swallows any
   `_lookup` error to `None`; the worker sets `place` only when it resolves. Because
   the provider is offline (no storage IO), it has **no transient class** — it can
   never enter the `photo_ops-0od` retry path, so geocoding never retries and never
   fails a photo. Verified live by `make smoke-media` (place present + a same-city
   dedup delta probe) and in unit tests (no-data / out-of-range / lookup-error →
   `None`).

## Non-goals (seams / deferred)

Cluster labels + public post `location_label` + the cluster **map** + **manual**
location-editing UI (023/024 — this session only lays the `Location` domain +
gallery tag they consume); `district` resolution; case-insensitive dedup (a
`lower()` index when `9q4.3` adds manual entries); a per-coordinate cache; an
external geocoding API; a standalone `location-service`; space-time clustering
(`2xu`); exact timezone resolution; reprocess/backfill of pre-022 `ready` photos
(no reprocess emit path exists — the demo reseeds so photos geocode via initial
processing). The `buf.gen.python.yaml` plugin pin (`photo_ops-643`) is not blocking
here — this session's regen showed no version-header float — and stays open.
