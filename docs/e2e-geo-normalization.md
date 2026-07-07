# Manual e2e — geo-normalization (session 022)

The thin acceptance path for the geo foundation: a signed-in user uploads a photo
with GPS EXIF, and after processing the photo carries a **human-readable place**
(`country / region / city`) shown as a tag in the gallery. Two photos at the same
place share **one** deduped `Location` row. A photo **without** GPS — or one the
geocoder can't resolve — still processes to `ready` with no place (coordinates, if
any, are preserved). Reverse-geocoding is **offline** (vendored GeoNames + a
pure-python nearest-neighbour in media-worker); no network or API key. Run against
the live Docker stack.

> Scope: this session surfaces a place **only in the gallery**. Cluster labels,
> the public post `location_label`, the cluster **map**, and **manual** location
> editing are sessions 023/024. `district` is not resolved at city granularity
> (stored `''`; manual editing fills it later), so the tag reads
> `Argentina / Buenos Aires`, not the full five-level example.

## Setup

```bash
make dev          # brings up the stack
make migrate      # now also runs migrate-photo → 0003_location.sql (locations + photo_assets.location_id)
```

If the stack was already up on a pre-022 build, rebuild media-worker + photo-service
and restart the api-gateway (stale-gRPC gotcha):

```bash
docker compose -f infra/docker/docker-compose.yml --env-file .env up -d --build media-worker photo-service
docker compose -f infra/docker/docker-compose.yml --env-file .env restart api-gateway
```

## Fixture

Three photos for one user, via the normal upload→processing flow:

- **G1** — JPEG with GPS EXIF at **Moscow** (55.75 N, 37.62 E).
- **G2** — a second JPEG at the **same** Moscow coordinates (to prove dedup).
- **N** — a JPEG with **no** GPS EXIF.

(The `make smoke-media` fixture already embeds the Moscow point; `make seed-demo`'s
photos embed a Buenos Aires point.)

## Scenario

1. **Sign in** (existing auth flow) — obtain the session cookie.

2. **Upload G1**; wait until `status = ready`.
   - `GET /photos/:id` (authed).
   - Expectation (HTTP 200): the response has a `location` object with
     `country = "Russia"`, a non-empty `city` (≈ `"Moscow"`), and `continent =
     "Europe"`. `lat`/`lon` on the photo are still the exact EXIF coordinates
     (unchanged by geocoding).

3. **Open G1 in the gallery** (web UI, photo detail modal).
   - Expectation: a **Location** row shows the place-tag `Russia / Moscow`
     (country / region / city, empty parts skipped). The existing GPS `lat, lon`
     row is unchanged.

4. **Upload G2** (same Moscow coordinates); wait until `ready`.
   - Expectation: G2's `GET /photos/:id` shows the **same** place-tag as G1.
   - **Dedup check (authoritative)** — exactly one `Location` row for the city:
     ```bash
     docker compose -f infra/docker/docker-compose.yml --env-file .env exec -T postgres \
       psql "$PHOTO_DATABASE_URL" -tAc "SELECT count(*) FROM locations WHERE city='Moscow'"
     ```
     Expectation: the count does **not** increase when G2 is added (both photos
     reference the same `Location` — verify: their `photo_assets.location_id`
     match).
     ```bash
     docker compose -f infra/docker/docker-compose.yml --env-file .env exec -T postgres \
       psql "$PHOTO_DATABASE_URL" -tAc "SELECT DISTINCT location_id FROM photo_assets WHERE id IN ('<G1>','<G2>')"
     ```
     Expectation: **one** distinct `location_id`.

5. **Upload N** (no GPS); wait until `status = ready`.
   - Expectation: N reaches `ready` (processing is **not** broken by the absent
     GPS). `GET /photos/:id` has no `location` (or an empty one); the gallery
     detail modal shows the Location row as the fallback `—`. `photo_assets.location_id`
     is `NULL`.

6. **Geocoder-unavailable fallback** (offline provider — degrade behaves like N).
   - The offline lookup returning nothing / raising is exercised by the media-worker
     unit tests (`test_geocode.py`: no-data / out-of-range / lookup-error → `None`).
     Its live-observable equivalent is step 5: **coordinates preserved, no place,
     photo still `ready`** (§3.4). No live injection is needed.

## Automated backing

- `make smoke-media` — live: uploads a Moscow GPS photo (place present:
  `country`/`city` non-empty), then a second same-city photo and asserts the
  `locations` count is **unchanged** (dedup delta probe), plus the existing
  corrupt-image → `failed` branch.
- `make smoke-ui` — live: the gallery renders the place-tag.
- `make gate` + `make coverage-gate` + `make test-guard` — unit tier: geocode
  fallbacks, `normalizePlace`, `finalizeResult` upsert/link, `decodeResult` place,
  `toProtoPhoto` mapping, `formatLocation`.

## Demo dataset

Pre-022 `ready` photos do **not** backfill a place (there is no reprocess path).
To show places in the demo, reset and reseed so photos geocode via *initial*
processing:

```bash
make reset && make dev && make migrate && make seed-demo
```

The seeded demo photos (Buenos Aires GPS) then render `Argentina / … / Buenos Aires`
in the gallery and on the cluster's photos.
