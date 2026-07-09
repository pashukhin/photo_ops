# Geo-normalization (3iy) — Skeleton Commit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to fill this skeleton task-by-task — each task makes its RED tests green within the provided stubs. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn photo GPS coordinates into human-readable places: offline reverse-geocoding in media-worker, a deduped `Location` model owned by photo-service, and a place-tag surfaced in the gallery — all fallback-tolerant (no GPS / geocoder-down never breaks processing).

**Architecture / WHY:** exSDD skeleton-first. `media-worker` geocodes offline (vendored GeoNames + pure-python NN — no scipy) and carries the place in the result proto; `photo-service` upserts a deduped `Location` (normalized 5-tuple, `NOT NULL DEFAULT ''`) after the opm winner-gate and links `photo_assets.location_id`; the gallery renders a tag. Entry points: design → `docs/superpowers/specs/2026-07-07-geo-normalization-design.md`; contract → `proto/photo/v1/processing.proto` (`GeoPlace`) + `photo_service.proto` (`PhotoAsset.location`); geocode → media-worker `geocode.py` + `test_geocode.py`/`test_handler.py`; Location → `photo.service.ts` (`normalizePlace` + `finalizeResult`) + `photo.service.spec.ts` + `migrations/0003_location.sql`; surface → `format.ts`/`format.spec.ts` + `PhotoDetailModal.tsx`; live oracle → `scripts/smoke-media-processing.sh` (DB dedup probe). Durable why/invariants land in `docs/adr/0007-*` + each service's `## Local invariants` at GREEN, not here.

**Tech Stack:** Python 3.12 (media-worker; pytest, Pillow/piexif, vendored GeoNames data), TypeScript (photo-service NestJS + drizzle + vitest; web Next.js + vitest/jsdom + testing-library), proto3 (buf + ts-proto + python plugin), Bash (smoke; curl/jq/psql), Postgres/MinIO/RabbitMQ.

## Global Constraints

- Method: RED test per obligation → minimal GREEN; **the plan authors the RED, not the GREEN**.
- **Offline, no scipy/numpy** in media-worker: vendor a GeoNames extract (`cities15000` + `admin1CodesASCII` + `countryInfo`, CC-BY 4.0 + a `NOTICE`) and a pure-python haversine NN. Both wrapper libs (`reverse_geocode`/`reverse_geocoder`) hard-depend on scipy — rejected for image weight.
- **Location dedup:** columns `NOT NULL DEFAULT ''`; service normalizes `trim` + `null/undefined→''` (**no lower-case** in 022 — all places geocoded, casing consistent, display stays `Buenos Aires`); `UNIQUE (continent,country,region,city,district)`; upsert is one round-trip `INSERT … ON CONFLICT (…) DO UPDATE SET continent = EXCLUDED.continent RETURNING id`.
- **Defensive geocoding:** no GPS or any lookup error → `reverse_geocode` returns `None`; coordinates are preserved and processing continues (§3.4). An offline provider has no transient class → geocoding never retries and never fails a photo.
- **Proto:** reuse the single `GeoPlace` message (no duplicate); `PhotoAsset.location` imports `processing.proto`. Pin `proto/buf.gen.python.yaml` (the only blocking part of `photo_ops-643`) **before** `make proto`.
- Coverage-gate: 100% new/changed-line coverage. New pure logic (`reverse_geocode`/`_lookup`, `normalizePlace`, `formatLocation`) is unit-covered by the RED tests; thin IO / render wiring that cannot be unit-instantiated is smoke-verified.
- test-integrity guard: removing/renaming-away a test needs an `Allow-test-removal: <reason>` commit trailer.
- Live smokes green before final review: `make smoke-media` (+ DB dedup probe), `make smoke-ui`. `make gate` + `make coverage-gate` + `make test-guard`.
- Every commit ends with the `Co-Authored-By` trailer.

## Non-Goals

- No cluster labels, no public post `location_label` (023/024 build those surfaces).
- No manual location-editing UI, no `Location` map view (9q4.3 / 9q4.2, session 023).
- No case-insensitive dedup this session (all places geocoded → consistent case; a `lower()` functional index is 9q4.3's when hand-typed entries can collide).
- No `district` resolution (city-granularity dataset → stored `''`; manual 9q4.3 fills). The gallery tag renders `country / region / city`, not the full five-level §3.4 example.
- No reprocess/backfill of pre-022 `ready` photos (no reprocess emit path exists — `PROCESSING_TYPE_REPROCESS` is a seam); the demo stack needs `make reset` + reseed.
- No per-coordinate cache (the deduped `Location` table is the cache — offline provider, no network cost).
- No external geocoding API; no space-time clustering method; no standalone location-service.

---

### Task 1: Proto contract — `GeoPlace` + pin python plugin

**Files:**
- Modify: `proto/buf.gen.python.yaml` (pin the `protocolbuffers/python` + `pyi` plugins — close the blocking part of `photo_ops-643`)
- Modify: `proto/photo/v1/processing.proto` (add `GeoPlace`; `ImageAttributes.place = 11`)
- Modify: `proto/photo/v1/photo_service.proto` (import `processing.proto`; `PhotoAsset.location = 21`)
- Regenerated (not hand-edited): `packages/proto-ts/**`, `apps/media-worker/src/photoops_proto/**`

**Interfaces:**
- Produces: proto `GeoPlace { string continent=1; country=2; region=3; city=4; district=5; raw_provider_data=6; }`; `ImageAttributes.place` (singular message, presence-tracked); `PhotoAsset.location` (same `GeoPlace`).
- Consumes: nothing.

**GREEN obligation:** none beyond the contract — this task IS the contract. Its fail-on-drift home is `make proto-check` + downstream typecheck, not a unit test.

- [ ] **Step 1: Pin the python proto plugin** — `proto/buf.gen.python.yaml`: give `protocolbuffers/python` and `protocolbuffers/pyi` an explicit `:vX.Y.Z` (mirror how ts-proto is pinned), so regeneration doesn't rewrite a floating version header and redden `proto-check` (the s020 failure mode).

- [ ] **Step 2: Add `GeoPlace` + `place` to `processing.proto`**

```proto
// Reverse-geocoded place (offline, city granularity). Plain string fields —
// message-level presence is tracked by the wrapper; '' = unresolved field.
message GeoPlace {
  string continent = 1;
  string country = 2;
  string region = 3;
  string city = 4;
  string district = 5;            // '' this session (manual 9q4.3 fills)
  string raw_provider_data = 6;   // JSON of the matched GeoNames record
}
```
and inside `message ImageAttributes { … orientation = 8; optional double lat = 9; optional double lon = 10; }` append:
```proto
  GeoPlace place = 11;            // absent when no GPS or geocoder yields nothing
```

- [ ] **Step 3: Add `location` to `PhotoAsset`** — in `photo_service.proto` add `import "photo/v1/processing.proto";` and, after `repeated PhotoVariantView variants = 20;`:
```proto
  photoops.photo.v1.GeoPlace location = 21;   // reverse-geocoded place (022); absent until resolved
```

- [ ] **Step 4: Regenerate + verify no drift**

Run: `make proto && git status --porcelain` (regenerated ts + python stubs staged in the same change) then `make proto-check` (Expected: PASS — no drift) and `make typecheck` (Expected: PASS — new types resolve).

- [ ] **Step 5: Commit the contract**

```bash
git add proto/ packages/proto-ts/ apps/media-worker/src/photoops_proto/
git commit -m "proto(geo): GeoPlace + ImageAttributes.place + PhotoAsset.location; pin python plugin (643)"
```

---

### Task 2: media-worker `geocode.py` — offline reverse geocoder

**Files:**
- Stub: `apps/media-worker/src/media_worker/geocode.py` (new — `GeoPlace`, `_lookup`, `reverse_geocode`)
- Test: `apps/media-worker/tests/test_geocode.py` (new — RED)
- Modify (GREEN, not skeleton): vendor `apps/media-worker/src/media_worker/data/` (GeoNames extract + `NOTICE`); implement `_lookup` (haversine NN) + `reverse_geocode` (validate → `_lookup` in try/except → `GeoPlace`; continent-code→name via a 7-entry map).

**Interfaces:**
- Produces: `@dataclass GeoPlace(continent, country, region, city, district, raw_provider_data: str)`; `reverse_geocode(lat: float | None, lon: float | None) -> GeoPlace | None`; internal seam `_lookup(lat: float, lon: float) -> GeoPlace`.
- Consumes: nothing from other tasks.

**GREEN obligation:** vendor the dataset + make the RED tests pass within these stubs. `reverse_geocode` validates inputs, calls `_lookup` inside `try/except Exception → None`, never raises. `_lookup` builds `raw_provider_data` as JSON of the matched GeoNames record **including the matched city's `lat`/`lon`** — that is the representative point photo-service reads back for `Location.lat/lon` (`GeoPlace` carries no lat/lon of its own; parsing raw is the seam). You may add narrower tests; you may not weaken/delete/rename these REDs.

- [ ] **Step 1: Write the RED tests** — `apps/media-worker/tests/test_geocode.py`

```python
"""RED: offline reverse-geocoding — resolution + defensive fallbacks (3iy)."""
import media_worker.geocode as geocode
from media_worker.geocode import reverse_geocode


def test_moscow_resolves_to_russia_europe():
    # why: a known major city resolves to stable country/continent + a city name.
    # (55.75N, 37.62E is central Moscow — the smoke fixture's coordinate.)
    place = reverse_geocode(55.75, 37.62)
    assert place is not None
    assert place.country == "Russia"
    assert place.continent == "Europe"
    assert "Moscow" in place.city


def test_none_coords_return_none():
    # why (§3.4): no GPS → no place, processing must continue (never raises).
    assert reverse_geocode(None, None) is None
    assert reverse_geocode(55.75, None) is None


def test_out_of_range_coords_return_none():
    # why: defensive validation, mirroring exif.py's lat/lon range guard.
    assert reverse_geocode(91.0, 0.0) is None
    assert reverse_geocode(0.0, 200.0) is None


def test_lookup_failure_is_swallowed_to_none(monkeypatch):
    # why (§3.4 "geocoder unavailable"): a dataset/lookup error degrades to None,
    # NOT a raise into the handler — coordinates preserved, processing continues.
    def boom(lat, lon):
        raise RuntimeError("dataset missing")
    monkeypatch.setattr(geocode, "_lookup", boom)
    assert reverse_geocode(55.75, 37.62) is None
```

- [ ] **Step 2: Run to confirm RED**

Run: `cd apps/media-worker && .venv/bin/python -m pytest tests/test_geocode.py -q`
Expected: FAIL — collection error (`ModuleNotFoundError: media_worker.geocode`), since the module is written in Step 3. After Step 3 it becomes `NotImplementedError` on the assertions.

- [ ] **Step 3: Write the stub** — `apps/media-worker/src/media_worker/geocode.py`

```python
"""Offline reverse-geocoding (022): coords → named place, city granularity.

Defensive like exif.py — never raises into the pipeline; any failure → None so
processing keeps the coordinates and continues (project_description §3.4).
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class GeoPlace:
    continent: str
    country: str
    region: str
    city: str
    district: str          # '' this session (manual 9q4.3 fills)
    raw_provider_data: str  # JSON of the matched GeoNames record


def _lookup(lat: float, lon: float) -> GeoPlace:
    """Nearest-city lookup over the vendored GeoNames extract."""
    raise NotImplementedError  # GREEN is the implementer's job


def reverse_geocode(lat: float | None, lon: float | None) -> GeoPlace | None:
    """Coords → GeoPlace, or None when absent/invalid/unresolvable. Never raises."""
    raise NotImplementedError  # GREEN is the implementer's job
```

- [ ] **Step 4: Confirm still RED + lint clean**

Run: `cd apps/media-worker && .venv/bin/python -m pytest tests/test_geocode.py -q` (Expected: FAIL — symbols resolve; `NotImplementedError` on the assertions) and `make lint-media-worker` (mypy clean on the signatures).

- [ ] **Step 5: Commit the skeleton**

```bash
git add apps/media-worker/src/media_worker/geocode.py apps/media-worker/tests/test_geocode.py
git commit -m "skeleton(geo): media-worker reverse_geocode (RED + stub)"
```

---

### Task 3: media-worker handler + codec — carry place into the result

**Files:**
- Modify: `apps/media-worker/tests/test_handler.py` (RED — geocode wiring)
- Modify (skeleton): `apps/media-worker/src/media_worker/handler.py` (add `from .geocode import reverse_geocode`), `apps/media-worker/src/media_worker/codec.py` (`encode_result(..., place: GeoPlace | None = None)` signature)
- Modify (GREEN): `handler._process` calls `reverse_geocode(attrs.lat, attrs.lon)` and passes `place=`; `encode_result` sets `result.attributes.place.*` when `place is not None`.

**Interfaces:**
- Consumes: `reverse_geocode`/`GeoPlace` (Task 2); `Attributes` (`exif.py`); proto `ImageAttributes.place` (Task 1).
- Produces: `encode_result(..., place: GeoPlace | None = None) -> bytes`.

**GREEN obligation:** wire the geocode call + the place encode within these signatures; make the RED pass. Do not weaken the REDs.

- [ ] **Step 1: Write the RED tests** — in `apps/media-worker/tests/test_handler.py` add the two imports to the **top import block** (ruff I001/E402: imports must not be mid-file), and append `_attrs` + `TestHandlerGeocode` after the existing tests.

```python
# --- add to the top import block ---
from src.media_worker.exif import Attributes
from src.media_worker.geocode import GeoPlace


# --- append after the existing test classes ---
def _attrs(lat, lon) -> Attributes:
    # minimal Attributes with the given coords; other fields are display defaults.
    return Attributes(
        width=640, height=480, taken_at_local="", taken_at_utc="",
        taken_at_tz_source="unknown", camera_make="", camera_model="",
        orientation=0, lat=lat, lon=lon, metadata_json="{}",
    )


class TestHandlerGeocode:
    def test_place_present_when_coords_resolve(self) -> None:
        # why (3iy): GPS coords → reverse_geocode → result.attributes.place populated.
        store = FakeObjectStore()
        bus = InMemoryBus()
        handler = JobHandler(store=store, publisher=bus)
        store._store["originals/photo-1.jpg"] = (_make_jpeg(), "image/jpeg", {})
        place = GeoPlace("Europe", "Russia", "Moscow", "Moscow", "", "{}")
        with mock.patch("src.media_worker.handler.extract_attributes", return_value=_attrs(55.75, 37.62)), \
             mock.patch("src.media_worker.handler.reverse_geocode", return_value=place):
            handler.handle(BusMessage(body=_make_job().SerializeToString(), correlation_id="c"))
        result = _decode_result(_drain_results(bus)[0][1])
        assert result.outcome == processing_pb2.PROCESSING_OUTCOME_SUCCEEDED
        assert result.attributes.HasField("place")
        assert result.attributes.place.country == "Russia"
        assert result.attributes.place.city == "Moscow"

    def test_no_place_when_no_gps(self) -> None:
        # why (§3.4): no GPS → geocode None → no place, but still SUCCEEDED.
        store = FakeObjectStore()
        bus = InMemoryBus()
        handler = JobHandler(store=store, publisher=bus)
        store._store["originals/photo-1.jpg"] = (_make_jpeg(), "image/jpeg", {})
        with mock.patch("src.media_worker.handler.extract_attributes", return_value=_attrs(None, None)), \
             mock.patch("src.media_worker.handler.reverse_geocode", return_value=None):
            handler.handle(BusMessage(body=_make_job().SerializeToString(), correlation_id="c"))
        result = _decode_result(_drain_results(bus)[0][1])
        assert result.outcome == processing_pb2.PROCESSING_OUTCOME_SUCCEEDED
        assert not result.attributes.HasField("place")
```

- [ ] **Step 2: Run to confirm the RED fails on the right reason**

Run: `cd apps/media-worker && .venv/bin/python -m pytest tests/test_handler.py::TestHandlerGeocode -q`
Expected: FAIL — `mock.patch("...handler.reverse_geocode")` errors because the symbol isn't imported into the handler yet (fix in Step 3), then FAIL on `HasField("place")`.

- [ ] **Step 3: Add the skeleton wiring points** — in `handler.py` add `from .geocode import reverse_geocode  # noqa: F401` (import only — unused until GREEN wires the call; the `noqa` keeps `make lint-media-worker`/ruff F401 clean at the skeleton commit); in `codec.py` add the `place: GeoPlace | None = None` parameter to `encode_result` (accept it; setting `result.attributes.place.*` is GREEN). Import `GeoPlace` in `codec.py`.

- [ ] **Step 4: Confirm RED on the assertion + lint**

Run: same pytest (Expected: `test_place_present_when_coords_resolve` FAILS on `assert result.attributes.HasField("place")` — the handler doesn't yet call `reverse_geocode`/pass `place`; `test_no_place_when_no_gps` already passes as a guard) and `make lint-media-worker` clean.

- [ ] **Step 5: Commit the skeleton**

```bash
git add apps/media-worker/tests/test_handler.py apps/media-worker/src/media_worker/handler.py apps/media-worker/src/media_worker/codec.py
git commit -m "skeleton(geo): handler geocode wiring RED + encode_result place param"
```

---

### Task 4: photo-service — `Location` schema + finalize upsert/link + `normalizePlace`

**Files:**
- New: `apps/photo-service/migrations/0003_location.sql`
- Modify: `Makefile` (`migrate-photo` += the 0003 line)
- Modify: `apps/photo-service/src/db/schema.ts` (`locations` table + `photoAssets.locationId`)
- Modify: `apps/photo-service/src/photo/photo.types.ts` (`GeoPlaceInput`, `NormalizedPlace`, `LocationRecord`; `ProcessingResultAttributes.place?`; `PhotoAssetRecord.locationId`; `PhotoWithVariants.location?`)
- Stub: `apps/photo-service/src/photo/photo.service.ts` (`export function normalizePlace(...)` throws; port `upsertLocation`/`listLocationsByIds`; `applyAttributes` param += `locationId`)
- Stub: `apps/photo-service/src/photo/photo.repository.ts` (`upsertLocation`/`listLocationsByIds` throw NotImplemented; `locationId` in `toRecord`/`applyAttributes`)
- Test: `apps/photo-service/src/photo/photo.service.spec.ts` (RED) + `apps/photo-service/src/photo/processing.codec.spec.ts` (RED — `place` decode)
- Modify (GREEN): `processing.codec.ts` `decodeResult` (map proto `attributes.place` → `attributes.place`); the repo methods (SQL upsert + batched select); `finalizeResult` (`normalizePlace(place)` → parse `raw_provider_data` for the representative `lat`/`lon` → `upsertLocation` → `applyAttributes({… locationId})`).

**Interfaces:**
- Produces: `normalizePlace(place: GeoPlaceInput): NormalizedPlace` (all 5 fields trimmed, `''`-coalesced); `PhotoRepositoryPort.upsertLocation(input: NormalizedPlace & { lat: number|null; lon: number|null; rawProviderData: unknown }): Promise<string>`; `PhotoRepositoryPort.listLocationsByIds(ids: string[]): Promise<LocationRecord[]>`; `applyAttributes(..., { …, locationId: string | null })`.
- Consumes: proto-decoded `place` on `ProcessingResultInput.attributes.place` (via `processing.codec.ts` decode — a GREEN wiring within this task), the opm winner-gate (`photo.service.ts:220`).

**GREEN obligation:** implement `decodeResult`'s place mapping, the SQL (`ON CONFLICT … DO UPDATE … RETURNING id`, batched select), `normalizePlace`, and `finalizeResult` upsert+link. `Location.lat/lon` (representative point) = the matched city's point parsed from `place.rawProviderData` (`GeoPlace` carries no lat/lon); pass those to `upsertLocation`, not the photo's coords. `applyAttributes`'s `locationId` is **optional** (`locationId?: string | null`) so the untouched call site still type-checks at skeleton; GREEN always passes it (value or `null`). Preserve session-021 idempotent finalize — the upsert + `location_id` write are individually idempotent and run only past the winner-gate. Do not weaken the REDs.

- [ ] **Step 1: Write the RED tests** — add to `apps/photo-service/src/photo/photo.service.spec.ts` (extend the `createService()` mock with `upsertLocation: vi.fn()` and `listLocationsByIds: vi.fn().mockResolvedValue([])` — the `[]` default protects the existing `listPhotos` tests, whose photos have no `locationId`, from a crash when GREEN calls the compose)

```typescript
import { normalizePlace } from './photo.service';

it('normalizePlace trims and coalesces missing fields to empty string', () => {
  // why (B1): the UNIQUE dedup key needs real '' (not null/undefined) — Postgres
  // treats NULL as distinct, so nullable columns would never dedup.
  expect(normalizePlace({ continent: '  South America ', country: 'Argentina', city: 'Buenos Aires ' }))
    .toEqual({ continent: 'South America', country: 'Argentina', region: '', city: 'Buenos Aires', district: '' });
});

it('normalizePlace preserves display case (no lower-casing in 022)', () => {
  // why: geocoded places are consistently cased; the tag must read "Buenos Aires".
  expect(normalizePlace({ city: 'Buenos Aires' }).city).toBe('Buenos Aires');
});

it('finalizeResult upserts a Location and links it when the result carries a place', async () => {
  // why (3iy): a geocoded place → one deduped Location → photo.location_id.
  repository.finalizeJob.mockResolvedValue(true);
  repository.findJobById.mockResolvedValue({ id: 'j1', userId: 'u1', status: 'succeeded' });
  repository.upsertLocation.mockResolvedValue('loc-1');
  await service.finalizeResult({
    jobId: 'j1', photoId: 'p1', outcome: 'succeeded',
    attributes: { lat: -34.6, lon: -58.4, place: { continent: 'South America', country: 'Argentina', region: '', city: 'Buenos Aires', district: '', rawProviderData: '{}' } },
    variants: [], metadataJson: '{}',
  });
  expect(repository.upsertLocation).toHaveBeenCalledWith(expect.objectContaining({ country: 'Argentina', city: 'Buenos Aires' }));
  expect(repository.applyAttributes).toHaveBeenCalledWith('p1', expect.objectContaining({ locationId: 'loc-1' }));
});

it('finalizeResult sets no location when the result carries no place', async () => {
  // why (§3.4): no GPS / geocoder-down → location_id null, photo still ready.
  repository.finalizeJob.mockResolvedValue(true);
  repository.findJobById.mockResolvedValue({ id: 'j1', userId: 'u1', status: 'succeeded' });
  await service.finalizeResult({
    jobId: 'j1', photoId: 'p1', outcome: 'succeeded',
    attributes: { lat: null, lon: null }, variants: [], metadataJson: '{}',
  });
  expect(repository.upsertLocation).not.toHaveBeenCalled();
  expect(repository.applyAttributes).toHaveBeenCalledWith('p1', expect.objectContaining({ locationId: null }));
});
```

And the wire→domain decode RED — add to `apps/photo-service/src/photo/processing.codec.spec.ts` (this is the live path `processing.consumer.ts` → `finalizeResult`; it is in coverage scope, so the new `place` mapping needs its own RED):

```typescript
it('decodeResult maps the proto place into attributes.place', () => {
  // why (coverage + live path): finalizeResult reads attributes.place, but only if
  // decodeResult carries it off the wire. Encode a result WITH a place, decode it,
  // assert the place round-trips (country/city + raw_provider_data).
  const body = encodeResultWithPlace({ country: 'Argentina', city: 'Buenos Aires', rawProviderData: '{"lat":-34.6,"lon":-58.38}' });
  const decoded = decodeResult(body);
  expect(decoded.attributes?.place).toEqual(expect.objectContaining({ country: 'Argentina', city: 'Buenos Aires' }));
  expect(decoded.attributes?.place?.rawProviderData).toContain('lat');
});
```

> Implementer note: `encodeResultWithPlace` builds a `PhotoProcessingResult` protobuf
> (via the same generated message `decodeResult` consumes) with `attributes.place`
> set — reuse the codec spec's existing encode helper / message builder; add the
> place fields to it.

- [ ] **Step 2: Run to confirm RED**

Run: `cd apps/photo-service && npx vitest run src/photo/photo.service.spec.ts -t 'normalizePlace|finalizeResult upserts|no location'` and `npx vitest run src/photo/processing.codec.spec.ts -t 'maps the proto place'`
Expected: FAIL — `normalizePlace` throws (stub); `finalizeResult` never calls `upsertLocation` and `applyAttributes` has no `locationId` key; `decodeResult` does not yet map `place` (`decoded.attributes.place` is undefined).

- [ ] **Step 3: Write the stubs + schema/migration**

`migrations/0003_location.sql`:
```sql
-- Migration 0003: reverse-geocoded Location (022). Owned by photo-service.
CREATE TABLE IF NOT EXISTS locations (
  id                uuid        PRIMARY KEY,
  continent         text        NOT NULL DEFAULT '',
  country           text        NOT NULL DEFAULT '',
  region            text        NOT NULL DEFAULT '',
  city              text        NOT NULL DEFAULT '',
  district          text        NOT NULL DEFAULT '',
  lat               double precision,   -- representative point (matched city's GeoNames point)
  lon               double precision,
  raw_provider_data jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT locations_place_uq UNIQUE (continent, country, region, city, district)
);
ALTER TABLE photo_assets ADD COLUMN IF NOT EXISTS location_id uuid;
```
`Makefile` `migrate-photo` (append after the 0002 line):
```makefile
	$(DC) exec -T postgres psql "$${PHOTO_DATABASE_URL}" < apps/photo-service/migrations/0003_location.sql
```
`photo.service.ts` — export the pure normalizer + widen the port (GREEN fills `finalizeResult`):
```typescript
export interface GeoPlaceInput { continent?: string; country?: string; region?: string; city?: string; district?: string; rawProviderData?: string; }
export interface NormalizedPlace { continent: string; country: string; region: string; city: string; district: string; }

export function normalizePlace(place: GeoPlaceInput): NormalizedPlace {
  throw new Error('not implemented');  // GREEN is the implementer's job
}
```
Add to `PhotoRepositoryPort`: `upsertLocation(input: NormalizedPlace & { lat: number | null; lon: number | null; rawProviderData: unknown }): Promise<string>;` and `listLocationsByIds(ids: string[]): Promise<LocationRecord[]>;`, and add `locationId?: string | null` (**optional** — so the current `applyAttributes` call site, which passes no `locationId`, still type-checks at skeleton) to the `applyAttributes` param object.
`photo.repository.ts` — throwing stubs so the class still implements the port:
```typescript
async upsertLocation(): Promise<string> { throw new Error('not implemented'); }
async listLocationsByIds(): Promise<LocationRecord[]> { throw new Error('not implemented'); }
```
`schema.ts` — add `locationId: uuid('location_id')` to `photoAssets` and a `locations` pgTable mirroring the migration. `photo.types.ts` — add `locationId: string | null` to `PhotoAssetRecord`, `place?: GeoPlaceInput` to `ProcessingResultAttributes`, and `LocationRecord` + `PhotoWithVariants.location?: LocationView | null`.

- [ ] **Step 4: Confirm RED + typecheck**

Run: same vitest command (Expected: `normalizePlace` RED on the throw; `finalizeResult` REDs on the missing `upsertLocation` call / `locationId`) and `make typecheck` (the new port methods + types resolve; `PhotoRepository` implements the widened port via the throwing stubs).

- [ ] **Step 5: Commit the skeleton**

```bash
git add apps/photo-service/migrations/0003_location.sql Makefile apps/photo-service/src/db/schema.ts apps/photo-service/src/photo/photo.types.ts apps/photo-service/src/photo/photo.service.ts apps/photo-service/src/photo/photo.repository.ts apps/photo-service/src/photo/photo.service.spec.ts apps/photo-service/src/photo/processing.codec.spec.ts
git commit -m "skeleton(geo): Location schema + finalize upsert/link + place-decode RED + normalizePlace stub"
```

---

### Task 5: photo-service surface — compose `location` in list + getPhoto + wire

**Files:**
- Test: `apps/photo-service/src/photo/photo.service.spec.ts` (RED — compose) + `apps/photo-service/src/photo/photo.grpc.controller.spec.ts` (RED — `toProtoPhoto` location; the controller is in coverage scope, so the wire mapping needs its own RED, not just the smoke)
- Modify (GREEN): `photo.service.ts` (`getPhoto`/`listPhotos` collect `locationId`s → `listLocationsByIds` → attach `location` to each `PhotoWithVariants`), `photo.grpc.controller.ts` (`toProtoPhoto` maps `location` → proto `GeoPlace`).

**Interfaces:**
- Consumes: `listLocationsByIds` + `PhotoWithVariants.location` (Task 4).
- Produces: `getPhoto`/`listPhotos` results carry `location`; `toProtoPhoto` emits `location`.

**GREEN obligation:** batched compose (mirror `listVariantsForPhotos` — collect ids, one `listLocationsByIds`, map by id), attach to both read paths; map to the wire in `toProtoPhoto`. Proto mapping's live oracle is `smoke-media` (`GET /photos/:id` `.location`).

- [ ] **Step 1: Write the RED test** — add to `photo.service.spec.ts`

```typescript
it('getPhoto attaches the location when the photo has a location_id', async () => {
  // why (surface): the gallery tag needs the place on the read path — getPhoto is
  // what smoke-media reads via GET /photos/:id.
  repository.findByIdWithVariantsForUser.mockResolvedValue({ photo: makePhotoRecord({ locationId: 'loc-1' }), variants: [] });
  repository.listLocationsByIds.mockResolvedValue([
    { id: 'loc-1', continent: 'South America', country: 'Argentina', region: '', city: 'Buenos Aires', district: '', lat: -34.6, lon: -58.4 },
  ]);
  const pwv = await service.getPhoto('user-1', 'photo-1');
  expect(pwv?.location).toEqual(expect.objectContaining({ country: 'Argentina', city: 'Buenos Aires' }));
});

it('getPhoto leaves location null when the photo has no location_id', async () => {
  // why: no-place photos render the fallback tag, not a crash.
  repository.findByIdWithVariantsForUser.mockResolvedValue({ photo: makePhotoRecord({ locationId: null }), variants: [] });
  const pwv = await service.getPhoto('user-1', 'photo-1');
  expect(pwv?.location ?? null).toBeNull();
  expect(repository.listLocationsByIds).not.toHaveBeenCalled();
});
```

And the wire-mapping RED — add to `apps/photo-service/src/photo/photo.grpc.controller.spec.ts` (build a `PhotoWithVariants` carrying a `location`, mirror the existing `makePhotoWithVariants()` helper):

```typescript
it('toProtoPhoto emits the location on the wire', async () => {
  // why (coverage + wire): toProtoPhoto is in coverage scope; the new location
  // mapping runs only when a location is present. Drive getPhoto with a located
  // photo and assert the reply carries it.
  service.getPhoto.mockResolvedValue({
    photo: makePhotoRecord(),
    variants: [],
    location: { continent: 'South America', country: 'Argentina', region: '', city: 'Buenos Aires', district: '' },
  });
  const reply = await controller.getPhoto({ photoId: 'photo-1', userId: 'user-1' });
  expect(reply.location).toEqual(expect.objectContaining({ country: 'Argentina', city: 'Buenos Aires' }));
});
```

- [ ] **Step 2: Run to confirm RED**

Run: `cd apps/photo-service && npx vitest run src/photo/photo.service.spec.ts -t 'attaches the location|leaves location null'` and `npx vitest run src/photo/photo.grpc.controller.spec.ts -t 'emits the location'`
Expected: FAIL — `getPhoto` does not yet read `locationId` / attach `location` (`pwv.location` undefined, `listLocationsByIds` not called); `toProtoPhoto` does not yet copy `location` to the reply (`reply.location` undefined).

- [ ] **Step 3: (no new stub — behavior change to `getPhoto`/`listPhotos`/`toProtoPhoto`)**

The REDs pin the obligation; the compose + wire mapping are GREEN. `PhotoWithVariants.location` already exists (Task 4).

- [ ] **Step 4: Confirm RED holds + typecheck**

Run: same vitest command (Expected: FAIL on `pwv?.location` undefined) and `make typecheck`.

- [ ] **Step 5: Commit the skeleton**

```bash
git add apps/photo-service/src/photo/photo.service.spec.ts apps/photo-service/src/photo/photo.grpc.controller.spec.ts
git commit -m "skeleton(geo): getPhoto/listPhotos compose + toProtoPhoto location RED"
```

---

### Task 6: web — gallery place-tag

**Files:**
- Stub: `apps/web/components/gallery/format.ts` (`formatLocation` throws)
- Test: `apps/web/components/gallery/format.spec.ts` (RED)
- Modify (skeleton): `apps/web/lib/api.ts` (`PhotoAsset.location?`)
- Modify (GREEN): implement `formatLocation`; add a "Location" row to `PhotoDetailModal.tsx` using it.

**Interfaces:**
- Consumes: `PhotoAsset.location` (Task 1 wire → Task 5 → gateway passthrough).
- Produces: `formatLocation(location?: {...}): string` — `country / region / city` of the non-empty parts, `FALLBACK` when none.

**GREEN obligation:** implement `formatLocation`; render it in the detail modal. Live oracle: `make smoke-ui`.

- [ ] **Step 1: Write the RED test** — `apps/web/components/gallery/format.spec.ts` (add cases)

```typescript
import { formatLocation } from './format';

it('formatLocation joins country / region / city, skipping empties', () => {
  // why: concise human tag; empty region is skipped, continent/district omitted.
  expect(formatLocation({ continent: 'South America', country: 'Argentina', region: '', city: 'Buenos Aires', district: '' }))
    .toBe('Argentina / Buenos Aires');
});

it('formatLocation returns FALLBACK when there is no place', () => {
  // why (§3.4): no-GPS / unresolved photos show the fallback, not an empty string.
  expect(formatLocation(undefined)).toBe('—');
  expect(formatLocation({})).toBe('—');
});
```

- [ ] **Step 2: Run to confirm RED**

Run: `cd apps/web && npx vitest run components/gallery/format.spec.ts -t formatLocation`
Expected: FAIL — `formatLocation` throws (stub).

- [ ] **Step 3: Write the stub + the api type**

`format.ts`:
```typescript
export interface PhotoLocation { continent?: string; country?: string; region?: string; city?: string; district?: string; }

// country / region / city of the non-empty parts; FALLBACK when none.
export function formatLocation(location?: PhotoLocation): string {
  throw new Error('not implemented');  // GREEN is the implementer's job
}
```
`api.ts` — add to `PhotoAsset`: `location?: { continent?: string; country?: string; region?: string; city?: string; district?: string };`

- [ ] **Step 4: Confirm RED + web typecheck**

Run: same vitest (Expected: FAIL on the throw) and `cd apps/web && npx tsc --noEmit` clean.

- [ ] **Step 5: Commit the skeleton**

```bash
git add apps/web/components/gallery/format.ts apps/web/components/gallery/format.spec.ts apps/web/lib/api.ts
git commit -m "skeleton(geo): web formatLocation RED + PhotoAsset.location type"
```

---

### Task 7: Live oracle — seed GPS + `smoke-media` dedup DB probe (dqb)

**Files:**
- Modify (GREEN): `scripts/lib/photoops-e2e.sh` (`gen_jpeg` embeds a fixed GPS point — Buenos Aires), `scripts/smoke-media-processing.sh` (place assertion + second same-city upload + DB dedup probe)

**Interfaces:**
- Consumes: the whole pipeline (Tasks 1–5 GREEN) on a live stack.
- Produces: `smoke-media` fails until a place resolves and dedup holds — the authoritative dqb oracle (mock unit tests prove wiring only; the UNIQUE constraint fires only here).

**GREEN obligation:** embed GPS in the shared `gen_jpeg` (Buenos Aires ≈ -34.60, -58.38 — piexif GPS block mirrors `smoke-media-processing.sh`'s existing one); extend `smoke-media-processing.sh` per the RED below; run it green.

- [ ] **Step 1: Write the RED smoke additions** — append to `scripts/smoke-media-processing.sh` after step 7

```bash
# ---------------------------------------------------------------------------
# 9. Geo (3iy): the resolved place is on the photo, and a SECOND photo at the SAME
#    coordinates DEDUPs to the same Location row. Place strings can't prove dedup
#    (two rows render identical text). A count DELTA (not an absolute count) is the
#    honest oracle AND is robust to rows left by prior smoke runs / seeds.
# ---------------------------------------------------------------------------
"$VENV_PYTHON" - "$PHOTO_PATH" <<'PY'
import json, sys
loc = (json.load(open(sys.argv[1])).get("location") or {})
if not loc.get("country") or not loc.get("city"):
    print(f"ASSERTION FAILED: photo.location incomplete: {loc!r}", file=sys.stderr); sys.exit(1)
print(f"[smoke-media] place = {loc.get('country')} / {loc.get('city')}")
PY

CITY="$("$VENV_PYTHON" -c 'import json,sys;print((json.load(open(sys.argv[1])).get("location") or {}).get("city",""))' "$PHOTO_PATH")"
loc_count() { docker compose -f infra/docker/docker-compose.yml --env-file .env exec -T postgres \
  psql "$PHOTO_DATABASE_URL" -tAc "SELECT count(*) FROM locations WHERE city = '$1'" | tr -d '[:space:]'; }
BEFORE="$(loc_count "$CITY")"
[ "${BEFORE:-0}" -ge 1 ] || { echo "ASSERTION FAILED: no locations row for '$CITY' after first photo (got '$BEFORE')" >&2; exit 1; }

# Upload a SECOND photo with the SAME Moscow fixture ($JPEG_PATH) → same city → must dedup.
curl -fsS -b "$COOKIE_PATH" -H 'content-type: application/json' \
  -d "{\"filename\":\"sample2.jpg\",\"contentType\":\"image/jpeg\",\"sizeBytes\":\"$SIZE_BYTES\"}" \
  "$API_BASE_URL/photos/upload-intents" > "$INTENT_PATH"
PID2="$(jq -r '.photoId' "$INTENT_PATH")"; UP2="$(jq -r '.uploadUrl' "$INTENT_PATH")"
curl -fsS -X PUT -H 'content-type: image/jpeg' --data-binary "@$JPEG_PATH" "$UP2" >/dev/null
curl -fsS -b "$COOKIE_PATH" -X POST "$API_BASE_URL/photos/$PID2/complete-upload" >/dev/null
DEADLINE=$(( $(date +%s) + 60 ))
while true; do
  ST2="$(curl -fsS -b "$COOKIE_PATH" "$API_BASE_URL/photos/$PID2" | jq -r '.status')"
  [ "$ST2" = "ready" ] && break
  { [ "$ST2" = "failed" ] || [ "$(date +%s)" -ge "$DEADLINE" ]; } && { echo "ASSERTION FAILED: second photo status=$ST2" >&2; exit 1; }
  sleep 2
done

AFTER="$(loc_count "$CITY")"
[ "$AFTER" = "$BEFORE" ] \
  || { echo "ASSERTION FAILED: dedup broken — a same-city second photo added a row ($BEFORE → $AFTER)" >&2; exit 1; }
echo "[smoke-media] OK — geo place present + dedup ('$CITY' rows unchanged: $BEFORE → $AFTER)"
```

- [ ] **Step 2: Run to confirm RED**

Run: `make smoke-media`
Expected: FAIL — before GREEN the `locations` table doesn't exist / no geocode runs, so the photo never gets a `.location` (and the migration isn't wired) → the place assertion fails (or the photo never reaches `ready`). This is the intended integration RED.

- [ ] **Step 3: (no stub — the GREEN across Tasks 1–5 + `gen_jpeg` GPS makes it pass)**

`gen_jpeg` GPS + the migration wiring (Task 4) + geocode (Tasks 2–3) + surface (Task 5) turn this green.

- [ ] **Step 4: Confirm the RED reason is geo, not a broken stack**

Run: `bash -n scripts/smoke-media-processing.sh` (syntax OK); `make smoke-media` (Expected: FAIL on the geo assertion / missing `.location`, NOT on signup/upload — those steps still pass).

- [ ] **Step 5: Commit the skeleton**

```bash
git add scripts/smoke-media-processing.sh
git commit -m "skeleton(geo): smoke-media place + dedup DB probe (RED)"
```

> Implementer note: two separate fixtures for two purposes — (1) `gen_jpeg` gains a fixed Buenos Aires GPS for the **seed** (`seed-demo.sh` → fresh photos geocode via initial processing); it is shared by `smoke-publication.sh` (a fixed point is benign there); `smoke-cluster.sh` keeps its own inline copy. (2) `smoke-media` uses its **own inline Moscow fixture** (`$JPEG_PATH`) for *both* dedup photos — it does not depend on `gen_jpeg`. If `PHOTO_DATABASE_URL` / the compose invocation differ in the run environment, thread them through the `Makefile smoke-media` target rather than hard-coding here.

---

### Task 8: ADR-0007 + docs (no RED — durable why)

**Files:** `docs/adr/0007-geo-normalization.md` (new); `docs/domain-model.md` (Location → implemented; ownership table), `docs/roadmap.md` (022 delivered), `docs/architecture.md` (if a boundary line needs it); `apps/photo-service/CLAUDE.md` + `apps/media-worker/CLAUDE.md` (`## Local context`/`## Local invariants`); `apps/media-worker/src/media_worker/data/NOTICE` (GeoNames CC-BY attribution).

**GREEN obligation:** author ADR-0007 recording: geocoding **for display, not clustering** (cite ADR-0005 §9 so it doesn't read as reopening a closed decision); offline vendored-dataset + bespoke-NN justification (both wrapper libs need scipy → rejected for image weight); **Location table IS the cache** (offline → no per-lookup cache); dedup-by-tuple, display-case, case-insensitive deferred to 9q4.3; external API rejected. Update the docs/CLAUDE.md in the same commits as the code they describe (AGENTS.md discipline). No RED test — the "test" is human review.

- [ ] **Step 1: Author `docs/adr/0007-geo-normalization.md`** (durable why, per the obligation above).
- [ ] **Step 2: Update domain-model / roadmap / architecture + service CLAUDE.md + the data NOTICE.**
- [ ] **Step 3: Commit** `git commit -m "docs(geo): ADR-0007 + Location implemented + CLAUDE.md/NOTICE"`.

---

## Skeleton Self-Review

- **Obligation coverage (spec → RED):**
  - Offline geocode + defensive fallbacks (§3.4) → `test_geocode.py` (Moscow resolve; None/out-of-range/lookup-raise → None) ✓
  - Place carried worker→service → `test_handler.py::TestHandlerGeocode` (place present / absent) ✓
  - Contract (`GeoPlace`, `place`, `location`) → Task 1 proto diff + `proto-check`/`typecheck` gate ✓
  - Location dedup key (B1: `NOT NULL DEFAULT ''` + trim/coalesce, no lower) → `normalizePlace` REDs + migration `UNIQUE` ✓
  - Wire→domain place decode → `processing.codec.spec.ts` `decodeResult maps place` RED (also closes the coverage-gate gap on the new decode line) ✓
  - finalize upsert/link + no-place path → `finalizeResult` REDs ✓
  - Surface on both read paths → `getPhoto` compose REDs (list mirrors, `listLocationsByIds` mock defaulted `[]`) + `toProtoPhoto` wire RED (controller spec) ✓
  - Gallery tag → `format.spec.ts` `formatLocation` REDs + `smoke-ui` ✓
  - **Dedup actually fires + place present (B2)** → live `smoke-media` count-**delta** probe (robust to prior-run rows) ✓
  - Demo reachability (B3) → `gen_jpeg` GPS (GREEN) + reset+reseed non-goal note ✓
  - Migration wired (must-fix) → `Makefile migrate-photo` line in Task 4 ✓
- **No GREEN:** stubs throw `NotImplementedError`/`Error('not implemented')`; the surface + smoke tasks carry REDs against existing code with no new production logic. The vendored dataset + NN, the SQL, the compose, and the renders are all the implementer's.
- **Type consistency:** `GeoPlace`(py)/`GeoPlace`(proto)/`GeoPlaceInput`+`NormalizedPlace`(ts)/`PhotoLocation`(web) — names are per-layer and intentional; `reverse_geocode`/`_lookup`, `normalizePlace`, `upsertLocation`/`listLocationsByIds`, `formatLocation` match across their stubs + tests. `PhotoAsset.location = 21` (20 = variants); `ImageAttributes.place = 11`.
- **Reviewable size:** ~13 focused REDs (4 py geocode + 2 py handler + 4 ts service + 1 ts codec-decode + 1 ts controller + 2 web) + 1 live smoke delta-probe + the proto/migration/schema diff — reviewable without reading an implementation.
- **Coverage note:** `reverse_geocode`/`_lookup` covered by `test_geocode` (Moscow exercises the real `_lookup`); `normalizePlace`/`formatLocation` by their unit REDs. Run `make skeleton-gate` before human review — an uncovered new stub line ⇒ add the missing RED (spec-change protocol).
- **dqb:** the change crosses HTTP↔gRPC↔AMQP↔Postgres↔MinIO and renders UI → `smoke-media` (place + dedup) and `smoke-ui` (tag) are the required live oracles, run green before final review.
