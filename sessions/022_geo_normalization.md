# Session 022: Geo-normalization (reverse-geocoding + Location)

Status: **Draft (заготовка).** Not yet brainstormed. Scope below is a proposal to
refine at session start. The **geo foundation** for the release-readiness work: it
turns coordinates into named places and stands up the `Location` model that the
cluster **map** view (`9q4.2`) and **manual location editing** (`9q4.3`) build on in
023. Sequenced **after 021**, before the cluster/location session.

> Human-readable scoping summary. Accepted design + plan land at session start
> under `docs/superpowers/specs` & `plans` (exSDD). Does not restate design
> (Principle 7).

## Goal

> Turn raw GPS coordinates into human-readable places, so clusters and published
> posts show real geography ("Argentina / Buenos Aires / Monserrat") instead of
> bare lat/lon — and space-time clustering becomes meaningful. Closes the gap
> where step 5 (§3.4) is only PARTIAL today (coordinates extracted, never named),
> and gives 023 the shared `Location` model for the cluster map + manual editing.

## Proposed scope (refine at session start)

- **`Location`** entity + reverse-geocoding cache in the photo domain
  (`docs/domain-model.md`: photo-domain reverse-geocoding cache/reference; do not
  extract a location service yet). This model is the seam `9q4.3` (manual location)
  writes to and `9q4.2` (map) reads from — design it so a MANUAL location and a
  GEOCODED one are the same shape.
- **Reverse geocoding** (`photo_ops-3iy`): a cached, fallback-tolerant lookup —
  missing/unavailable geocoding must not break processing (§3.4). Decide provider
  vs offline dataset at brainstorm.
- **Surface place** in the gallery, cluster labels, and the public post
  `location_label`.
- **(Stretch)** register the space-time clustering method (ADR-0005 seam) now that
  a real place metric exists.

## Out of scope

The manual location-editing **UI** and the cluster **map** view themselves — those
are `9q4.3`/`9q4.2` in session 023 (this session only lays the `Location` domain +
geocoding they consume). Timezone exact resolution; map tiles/rendering; admin-
boundary split as a cluster criterion (ADR-0005 keeps that separate); a standalone
`location-service`.

## Method (exSDD)

Brainstorm → skeleton (Location migration + geocoding port + RED tests, incl. the
no-GPS / geocoder-down fallbacks) = reviewed spec → GREEN. ADR if the
provider/caching choice is a durable why.

## Depends on

- EXIF GPS extraction (already shipped in media-worker). Sequenced after 021;
  it is the **prerequisite** for session 023 (`9q4.2` map + `9q4.3` manual location).

## Verification bar

Unit for geocoding cache + fallbacks (no-GPS, provider-down → coordinates
preserved, processing continues); live `make smoke-media` (+ `make smoke-cluster`
if space-time lands); `make gate` + `make coverage-gate` + `make test-guard`;
final `/code-review`.

## References

- `photo_ops-3iy` (reverse-geocoding); feeds `9q4.2`/`9q4.3` (session 023);
  ADR-0005 (space-time seam); §3.4 / §6 `Location`.
- Method + gate tier: `docs/agent-workflow-evolution.md` (Decisions 1, 7).
