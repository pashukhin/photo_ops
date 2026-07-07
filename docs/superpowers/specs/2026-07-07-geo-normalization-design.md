# Geo-normalization (3iy) — design note (exSDD lane)

Date: 2026-07-07 · Issue: `photo_ops-3iy` (+ sub-beads) · Branch: `session-022-geo`

> **Why thin.** Executable-spec lane (agent-workflow-evolution Decision 1). The real
> spec is the RED fallbacks + the live `smoke-media` assertions + the proto/schema
> contracts; this note is intent + decisions + layer-routing + entry-points only —
> not a prose twin (Principle 7). Durable *why* lands in ADR-0007.

## Intent

Turn raw GPS coordinates into human-readable places and stand up the `Location`
model in the photo domain — the geo **foundation** for release-readiness (epic
`9q4`). Closes the gap where §3.4 is only PARTIAL today (coordinates extracted,
never named). This is the seam session 023 builds on: the cluster **map**
(`9q4.2`) reads it, **manual location** (`9q4.3`) writes the same shape.

Foundation, not UI. One visible proof this session: a place-tag in the gallery.

## Settled decisions (brainstorm 2026-07-07 + adversarial review)

1. **Geocoding runs offline in `media-worker` (Python)** — it already extracts
   `lat`/`lon`; place travels in the result message. Not photo-service, not an
   external API. *Rejected external API:* network dep + key + rate-limit +
   non-determinism; the fallback RED needs offline-tolerance anyway.

2. **Provider = vendored GeoNames extract + a pure-python haversine nearest-
   neighbour (no scipy/numpy).** *Principle-1 justification (recorded in ADR):*
   the only maintained wrappers — `reverse_geocode` and `reverse_geocoder` — both
   **hard-depend on scipy** (`from scipy.spatial import cKDTree`;
   `install_requires=["numpy","scipy"]`, verified against the 1.6.6 sdist), an
   unacceptable weight add to the deliberately-lean worker image (Pillow/piexif
   only) given the repo's disk/ENOSPC sensitivity. So we **reuse the GeoNames
   dataset** (not reinventing data) and hand-roll only the ~30-line NN (the libs'
   sole value — a fast *batch* KDTree — is moot at one-photo-per-message).
   - Vendored (GeoNames, **CC-BY 4.0 — needs a NOTICE**): `cities15000.txt`
     (~25k rows; `Location.lat/lon` = the **matched city's GeoNames point**, not
     a computed centroid and not the photo's coord), `admin1CodesASCII.txt`
     (region/admin1 **name**, keyed `cc.admin1`), `countryInfo.txt` (country
     **name** + **continent**, keyed `cc`). Continent comes from `countryInfo`,
     **not** a hand-maintained map (Principle 7).
   - `district` is **not resolvable** at city granularity → stays `''` this
     session; manual editing (`9q4.3`) fills it later. So the 022 tag renders
     `country / region / city` (e.g. "Argentina / Ciudad Autónoma de Buenos
     Aires / Buenos Aires"), **not** the full five-level §3.4 example.

3. **`Location` dedup by normalized 5-tuple** `(continent,country,region,city,
   district)`. Columns are **`NOT NULL DEFAULT ''`**; the service normalizes
   `trim`/`lower`/`NULL→''` **before** the upsert; `UNIQUE` sits over the real
   `''` values (Postgres treats NULL as *distinct* — nullable columns would
   silently NOT dedup: **fix B1**). One round-trip:
   `INSERT … ON CONFLICT (…5 cols…) DO UPDATE SET continent = EXCLUDED.continent
   RETURNING id`. `Location.lat/lon` = the geocoder's representative point;
   `photo_assets.lat/lon` keeps the photo's exact coords. Manual `9q4.3` inserts
   the same shape → converges by tuple. *Consequence to state:* when `9q4.3`
   later fills `district`, the tuple changes → a new `Location` row + re-point of
   `location_id` (acceptable).

4. **Surface = gallery place-tag only.** `photo-service` list contract carries a
   `location`; the web gallery renders it. Cluster labels + public post
   `location_label` → 023/024 (they build those surfaces). Space-time clustering
   method is **not** registered here — it uses coords via haversine, not place
   names; geocoding does not unlock it (ADR-0005 §9); its home is `2xu`.

## Layer routing (each fact in its cheapest fail-on-drift home)

| Fact | Home |
| --- | --- |
| coord → place lookup + defensiveness | `media-worker` `geocode.py` (`reverse_geocode(lat,lon) -> GeoPlace | None`) + unit tests |
| place travels worker → service | `proto/photo/v1/processing.proto` (`GeoPlace` nested in `ImageAttributes`) |
| `Location` table + dedup key + FK | `apps/photo-service/migrations/0003_location.sql` (schema + `UNIQUE`) |
| upsert-dedup + link, idempotent | `photo.service.ts` `finalizeResult` (after the opm winner-gate) |
| dedup actually fires; place present | **live `smoke-media` DB probe** (two same-city GPS uploads → `SELECT count(*) FROM locations WHERE city=…` **== 1**; Moscow fixture → non-empty place). Place *strings* alone don't prove dedup — two rows render identical text; the count probe is the only honest oracle — **fix B2** |
| place-tag visible | `photo_service.proto` `PhotoAsset` += `location` (reuses `GeoPlace` via cross-import of `processing.proto` — no duplicate message, Principle 7); `photo.repository` `listLocationsByIds` + service compose in **both** `listPhotos` **and** `getPhoto` (mirrors the variant pattern, not a `list()` JOIN); `toProtoPhoto` maps it to the wire; web gallery render |
| no-GPS / geocoder-down → coords kept, continue | RED unit (handler) + the fallback rows below |
| durable why | `docs/adr/0007-geo-normalization.md` |

## Contract (proto)

```proto
// Reverse-geocoded place (offline, city-granularity). Plain string fields:
// message presence is tracked by the wrapper; keeping fields non-optional avoids
// the gateway's top-level `_`-presence spread filter. Empty string = unresolved.
message GeoPlace {
  string continent = 1;
  string country = 2;
  string region = 3;
  string city = 4;
  string district = 5;            // '' this session (manual 9q4.3 fills)
  string raw_provider_data = 6;   // JSON of the matched GeoNames record
}
message ImageAttributes {
  // … existing fields 1-10 (incl. optional double lat=9, lon=10) …
  GeoPlace place = 11;            // absent when no GPS or geocoder yields nothing
}
```

`PhotoAsset` (the list/get contract in `photo_service.proto`) gains
`GeoPlace location = 20;` by **importing `photo/v1/processing.proto`** and reusing
the `GeoPlace` message — not a second copy (Principle 7). `photo_service.proto`
currently imports only `common` + annotations, so the new import is a deliberate
contract edit.

`make proto` regenerates **both** ts (`packages/proto-ts`) and python
(`apps/media-worker/src/photoops_proto`) stubs; `proto-check` diffs both.
**Prerequisite (cheap fix, Principle 8):** pin the **python** plugin in
`proto/buf.gen.python.yaml` (`protocolbuffers/python` + `pyi` are unpinned)
*before* regenerating, so a floating-version header rewrite does not redden the
drift check (the s020 ts-proto failure mode). This pin is the *only* blocking
part of `photo_ops-643` — that issue is broader (go/grpc/cluster-python plugins);
closing it fully is **not** a prerequisite here.

## Schema (`photo-db`, migration 0003)

```sql
CREATE TABLE IF NOT EXISTS locations (
  id                uuid        PRIMARY KEY,
  continent         text        NOT NULL DEFAULT '',
  country           text        NOT NULL DEFAULT '',
  region            text        NOT NULL DEFAULT '',
  city              text        NOT NULL DEFAULT '',
  district          text        NOT NULL DEFAULT '',
  lat               double precision,   -- representative point (city centroid)
  lon               double precision,
  raw_provider_data jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT locations_place_uq UNIQUE (continent, country, region, city, district)
);
ALTER TABLE photo_assets ADD COLUMN IF NOT EXISTS location_id uuid;  -- in-DB FK (same DB/owner)
```

In-DB FK is legitimate: same DB, same owner (photo-service owns both) — not a
cross-service ref (`docs/domain-model.md` §Location). Locations are append-only
→ `ON DELETE NO ACTION` is safe.

**Wiring (must-fix):** `make migrate-photo` hardcodes each SQL file (there is no
glob runner) and is run by `smoke-stack.sh` before the app starts. Add the
`0003_location.sql` line to `migrate-photo`, else the table never exists on a
migrated stack and finalize's `INSERT … ON CONFLICT` throws → the photo never
reaches `ready`. Mirror the migration in the drizzle `src/db/schema.ts`
(`locations` table + `photo_assets.location_id`). On the service side,
`raw_provider_data` is proto `string` → `jsonb`: `JSON.parse` before the upsert
(precedent: `parseMetadata` for `metadata_json`).

## Fallback (RED) — §3.4

| Scenario | Behaviour |
| --- | --- |
| No GPS (`lat`/`lon` None) | `geocode` not called → result has no `place` → `location_id` NULL → status `ready`. |
| Geocoder no-data / raises | `reverse_geocode` returns `None` (any exception caught, `warn`, continue) → same as above. |
| Error taxonomy | Offline provider has **no transient class** (no storage IO) → it can never enter the `0od` transient-retry path → geocoding **never retries and never fails the photo**. |
| Caching (§3.4) | The deduped `Location` table **is** the durable cache/reference. Offline provider = no network cost → **no per-coordinate cache** is added (recorded in ADR so nobody bolts one on). |

## Demo reachability (fix B3)

- Seed fixtures currently emit **GPS-less** JPEGs (`scripts/lib/photoops-e2e.sh`
  `gen_jpeg` sets `"GPS": {}`). → **embed GPS in `gen_jpeg`** (copy the proven
  4-key piexif block from `smoke-media-processing.sh`) so a fresh seed geocodes
  via *initial* processing (**no reprocess needed** — the honest framing;
  `PROCESSING_TYPE_REPROCESS` is a seam, not emitted). Note the shared
  `gen_jpeg` is also used by `smoke-publication.sh` (a hardcoded GPS point is
  benign there); `smoke-cluster.sh`/`smoke-media-processing.sh` carry their own
  inline copies and are unaffected.
- Pre-022 `ready` photos won't backfill (no reprocess path) → document that the
  demo stack needs `make reset` + reseed to show places. `smoke-media` (already
  Moscow GPS) proves the pipeline without any backfill.

## Verification bar

- **Unit (media-worker):** `geocode.py` — valid point → place; no-data → None;
  exception → None. `handler` — no-GPS → result without place; geocoder-raise →
  result without place, outcome SUCCEEDED.
- **Unit (photo-service):** `finalizeResult` **wiring only** (calls upsert +
  sets `location_id`; place absent → `location_id` untouched). Dedup correctness
  is **not** claimed here (no in-process Postgres — `4vg`).
- **Live `make smoke-media`** (dqb, authoritative): two same-city GPS uploads →
  a **DB probe** (`$(DC) exec -T postgres psql "$$PHOTO_DATABASE_URL" -c
  "SELECT count(*) FROM locations WHERE city='…'"`, the migrate-target pattern)
  asserts **exactly one** `locations` row (place strings alone can't prove
  dedup); Moscow fixture → non-empty `.location` on `GET /photos/:id`.
  `make smoke-ui` shows the gallery tag.
- `make gate` + `make coverage-gate` + `make test-guard`; final `/code-review`.

## ADR-0007 (durable why)

Records: geocoding added **for display/labels, not clustering** (cites ADR-0005
§9 explicitly so it doesn't read as reopening a closed decision); offline in
media-worker; **Location table IS the cache** (no per-lookup cache);
dedup-by-tuple in photo-service; **vendored-dataset + bespoke-NN justification**
(both wrapper libs require scipy → rejected for image weight); external API
rejected.

## Entry points (files)

- `apps/media-worker/src/media_worker/geocode.py` (new) + `data/` vendored
  GeoNames files + `NOTICE`; `handler.py` (call after `extract_attributes`);
  `codec.py` (`encode_result` carries `place`); `tests/test_geocode.py`,
  `test_handler.py`.
- `proto/photo/v1/processing.proto` (+`GeoPlace`), `photo_service.proto`
  (`PhotoAsset.location`); `proto/buf.gen.python.yaml` (pin — 643).
- `apps/photo-service/migrations/0003_location.sql` + **`Makefile`
  `migrate-photo`** (add the 0003 line); `src/db/schema.ts` (`locations` +
  `location_id`); `photo.service.ts` (`finalizeResult` upsert+link;
  `location` compose in **both** `listPhotos` and `getPhoto`); `photo.repository.ts`
  (`listLocationsByIds`); `photo.grpc.controller.ts` (`toProtoPhoto` maps
  `location`); `photo.types.ts`; `processing.codec.ts` (decode `place`,
  `JSON.parse` `raw_provider_data`); specs.
- `apps/web` gallery `PhotoAsset` type + place-tag render
  (`components/gallery/*`); `apps/api-gateway` `mapPhoto` (verify nested
  `location` flows through the non-`_` spread — expected no change).
- `scripts/lib/photoops-e2e.sh` (`gen_jpeg` GPS); `scripts/smoke-media-*.sh`
  (dedup + place assertions).
- `docs/adr/0007-geo-normalization.md`; `docs/domain-model.md`,
  `docs/roadmap.md`, `docs/architecture.md` (mark Location implemented);
  `apps/media-worker/CLAUDE.md`, `apps/photo-service/CLAUDE.md`.

## Beads

Re-scope `3iy` (its "during clustering stage" framing is superseded — geo is now
for display); file sub-beads: proto+skeleton, media-worker geocode+data,
photo-service Location+dedup, gallery surface, seed GPS, ADR-0007, pin-python-
plugin (`643`).
