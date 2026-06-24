# PhotoOps Media-Processing Backend Design

Date: 2026-06-24

Session: `sessions/008_media_processing_async_skeleton.md`

## Context

PhotoOps currently implements authenticated upload/list: a photo moves
`uploading → uploaded` and then stops. Nothing processes it, no image is ever
served back to the browser, and no extracted attributes exist. The driving
product goal for this session is two UI stories (a processing-status table, and
a table of photos with extracted attributes plus a detail modal with a
preview). Those are a UI showcase of backend capabilities that do not exist
yet.

This session builds the backend foundation those stories require. The rich UI
that consumes it is split into session 011
(`sessions/011_rich_photo_gallery_ui.md`, renumbered from 009). This session
deliberately builds all the **data and delivery** the UI needs, but not the
**query ergonomics** (sort/filter/pagination), which are designed against the
concrete UI in 011.

This is the first async workflow in the system and the first real behavior in
the Python `media-worker`. It is architecture-sensitive: it introduces a new
contract type (async messaging), a second service touching MinIO, a new entity,
and reliability semantics.

## Goals

- Land the first async processing workflow end to end:
  `CompleteUpload → job → media-worker → variants + attributes → result →
  photo-service writes → uploaded → processing → ready | failed`.
- Generate `thumbnail` and `preview` variants and serve them back to the owner.
- Extract basic EXIF + GPS (`taken_at`, camera, orientation, lat/lon) and store
  full sanitized raw metadata.
- Expose the data the gallery UI needs: extracted attributes, status, variant
  URLs, and a per-photo detail RPC.
- Be reliable (NFR 4.3): idempotent, charge-once-ready, partial-failure
  tolerant, failures surfaced as `failed`.
- Fold in structured logging + correlation id across the async boundary.

## Non-Goals (deferred)

- **Reverse geocoding / `Location` normalization (stage 3.4).** We store GPS
  `lat`/`lon` only; the human-readable geo hierarchy and `location_id` are
  deferred.
- **Query ergonomics** (sorting, filtering, pagination params on `ListPhotos`)
  — designed in session 009 against the concrete UI.
- **The rich gallery UI** — session 009.
- **The `publish` variant** (public-page rendition) — needed at publication time.
- **Usage emission / `BillingEvent`** — deferred to the usage-accounting stage;
  008 is made usage-ready, not usage-emitting (see "Usage readiness").
- **User-initiated reprocessing as a feature** — only the design seam is built;
  008 ships the `initial` processing path only (see "Reprocessing seam").
- **Multi-format input (RAW/HEIC/PNG)** — upload still accepts JPEG only; the
  pipeline is designed format-agnostic so adding decoders later is not a rewrite.
- **Multi-target (connector-specific) variant renditions** — seam named, not built.

## Architecture and Data Flow

The architecture frame already anticipates this slice: `rabbitmq` is the async
broker, `media-worker` is the Python worker with no database, and `photo-service`
owns `photo-db` and variant metadata.

```text
            CompleteUpload (existing)
 web ─▶ api-gateway ─▶ photo-service
                          │  1. uploaded → processing (guarded)
                          │  2. create ProcessingJob (job_id)
                          │  3. publish ProcessPhotoJob ──────────────▶ [job queue]
                          │                                                  │
                          │                                          media-worker
                          │                                          4. download original (MinIO)
                          │                                          5. claim check (variant meta)
                          │                                          6. auto-orient + resize
                          │                                             → thumbnail + preview (MinIO)
                          │                                          7. extract EXIF/GPS
                          │  9. consume result ◀───────────────────  8. publish PhotoProcessingResult
                          │     finalize (idempotent by job_id):           [result queue]
                          │     - upsert PhotoVariant rows
                          │     - write attributes + metadata_json
                          │     - processing → ready | failed
                          ▼
                        photo-db
```

Key invariant preserved: **only `photo-service` writes `photo-db`.** The worker
never writes the DB; it reports results over a queue. The worker touches only
MinIO (original read, variant write) and the broker.

### Messaging abstraction (ports and adapters)

Business code depends on a thin transport **port**, never on RabbitMQ directly,
so the broker can later be swapped (NATS, Kafka) by changing an adapter and
config, not domain code.

Two layers, kept distinct:

- **Message schema = proto** (cross-language contract, shared via codegen).
- **Transport = a per-service port.** `photo-service` (TS) and `media-worker`
  (Python) each get a thin, mirrored port. There is no shared cross-language
  messaging library; the only thing they share is the proto schema.

Minimal port surface (the test of a real abstraction — broker concepts must not
leak into it):

```text
publish(message, correlationId)
consume(handler)            # at-least-once; handler success → ack, throw → nack/retry
```

Exchanges, routing keys, dead-letter config, partitions, and offsets are
**adapter configuration**, not part of the port signature. We build exactly one
real adapter (RabbitMQ) plus an **in-memory/fake adapter for tests** — the fake
both enables fast component tests and proves the abstraction holds without a
broker. The TS adapter may wrap NestJS's transport internally, but the domain
port stays ours. No second real adapter (NATS/Kafka) is built now.

### Queue topology and reliability (RabbitMQ adapter)

- Two flows, two queues, each with its own exchange: a **job** flow
  (photo-service → worker) and a **result** flow (worker → photo-service).
- **Durable** queues + **persistent** messages — jobs survive a broker restart.
- **Ack after successful handling** (at-least-once); duplicates are handled by
  idempotency, not avoided.
- **Bounded retry → dead-letter.** The DLQ is the manual-inspection /
  future-reprocess surface. *As implemented:* the in-memory test bus retries a
  throwing handler up to **N = 3** then drops; the real RabbitMQ adapters
  `nack(requeue=false)` straight to the DLQ on an escaped exception. This is a
  deliberate simplification — the worker's `JobHandler` already catches every
  *expected* failure and self-publishes a `FAILED` result, so an exception that
  escapes to the broker is an unexpected/crash case where immediate dead-letter
  (plus idempotent claim-based redelivery on crash) is the honest behavior. Both
  language adapters share this policy.

## Message Contracts (proto)

A new proto module carries the async payloads (e.g. `proto/photo/v1/processing.proto`).
Payloads are proto messages serialized into the AMQP body.

```proto
enum ProcessingType {
  PROCESSING_TYPE_UNSPECIFIED = 0;
  PROCESSING_TYPE_INITIAL     = 1;
  PROCESSING_TYPE_REPROCESS   = 2;   // seam only; not emitted in 008
}

message ProcessPhotoJob {
  string job_id         = 1;   // UUID v7, == ProcessingJob.id
  string photo_id       = 2;
  string user_id        = 3;
  string object_key     = 4;   // original's MinIO key
  ProcessingType type   = 5;
  string correlation_id = 6;
}

enum ProcessingOutcome {
  PROCESSING_OUTCOME_UNSPECIFIED = 0;
  PROCESSING_OUTCOME_SUCCEEDED   = 1;
  PROCESSING_OUTCOME_FAILED      = 2;
}

message ImageAttributes {
  uint32 width  = 1;                  // oriented (as displayed)
  uint32 height = 2;
  string taken_at_local     = 3;      // ISO local wall-clock, no tz; "" if absent
  string taken_at_utc       = 4;      // ISO instant; "" if unresolved
  string taken_at_tz_source = 5;      // exif_offset | gps_time | unknown
  string camera_make        = 6;
  string camera_model       = 7;
  uint32 orientation        = 8;      // EXIF orientation value 1..8 (0 = absent)
  optional double lat       = 9;
  optional double lon       = 10;
}

message VariantResult {
  string variant_type = 1;            // thumbnail | preview
  string object_key   = 2;
  uint32 width        = 3;
  uint32 height       = 4;
  uint64 size_bytes   = 5;
  string content_type = 6;
}

message PhotoProcessingResult {
  string job_id              = 1;
  string photo_id            = 2;
  string correlation_id      = 3;
  ProcessingOutcome outcome  = 4;
  string error_message       = 5;     // when FAILED
  ImageAttributes attributes = 6;     // when SUCCEEDED
  repeated VariantResult variants = 7;
  string metadata_json       = 8;     // sanitized raw EXIF as a JSON string
}
```

`metadata_json` is carried as a JSON string (proto has no native JSON column
type and `Struct` is heavier than needed); `photo-service` stores it as `jsonb`.

## Data Model Changes (photo-db, owned by photo-service)

### `photo_assets` — new columns (migration `ALTER`, all nullable)

Nullable because pre-processing rows have no attributes; they are filled at
finalize when the data is present.

| Column | Type | Source |
| --- | --- | --- |
| `width`, `height` | `int` | decode, oriented |
| `taken_at_local` | `timestamp` (no tz) | EXIF `DateTimeOriginal` (camera wall-clock) |
| `taken_at_utc` | `timestamptz` | resolved instant, when enough data exists |
| `taken_at_tz_source` | `text` | `exif_offset` \| `gps_time` \| `unknown` |
| `camera_make`, `camera_model` | `text` | EXIF `Make` / `Model` |
| `orientation` | `smallint` | EXIF `Orientation` (1..8) |
| `lat`, `lon` | `double precision` | EXIF GPS → signed decimal |
| `metadata_json` | `jsonb` | sanitized full EXIF |

This refines the projected single `taken_at` in `docs/domain-model.md` into
`taken_at_local` / `taken_at_utc` / `taken_at_tz_source`. `location_id`
(reverse-geocoding) is **not** added — deferred.

### `photo_variants` — new table

```text
id           uuid       PK
photo_id     uuid       NOT NULL                 -- logical ref to photo_assets
variant_type text       NOT NULL CHECK (thumbnail|preview)
object_key   text       NOT NULL
width        int        NOT NULL
height       int        NOT NULL
size_bytes   bigint     NOT NULL
content_type text       NOT NULL
created_at   timestamptz NOT NULL DEFAULT now()
updated_at   timestamptz NOT NULL DEFAULT now()
UNIQUE (photo_id, variant_type)
```

The `UNIQUE (photo_id, variant_type)` constraint is the data-layer idempotency
key: result writes upsert on it.

### `processing_jobs` — new table (the attributable run record)

```text
id            uuid       PK                       -- == job_id (UUID v7)
photo_id      uuid       NOT NULL
user_id       uuid       NOT NULL
type          text       NOT NULL CHECK (initial|reprocess)
status        text       NOT NULL CHECK (queued|succeeded|failed) DEFAULT 'queued'
correlation_id text
error_message text
started_at    timestamptz                          -- set at publish
finished_at   timestamptz                          -- set at finalize
created_at    timestamptz NOT NULL DEFAULT now()
updated_at    timestamptz NOT NULL DEFAULT now()
INDEX (photo_id)
```

A new row per run (never deleted), so the run history is append-only-ish. It
serves three concerns at once: idempotent finalize guard, observability (job
duration via timestamps + correlation id), and future charge-once billing.

## Status Machine

```text
uploading ──CompleteUpload──▶ uploaded ──publish job (guarded)──▶ processing
                                                                     │
                                              result SUCCEEDED ──────┼─▶ ready
                                              result FAILED / DLQ ───┴─▶ failed
   (failed ──reprocess──▶ processing : deferred, seam only)
```

- `uploaded → processing` is set by `photo-service` **at publish time**, guarded
  (`WHERE status = 'uploaded'`), giving the UI a real intermediate state without
  a separate "worker started" message.
- `processing → ready | failed` is applied on the result (or DLQ exhaustion →
  `failed`).

## Idempotency and Reliability

At-least-once delivery means both the job and the result may arrive twice; the
user's billing requirement means duplicate **work** (not just duplicate state)
must be avoided so a future itemized invoice never double-charges.

1. **Finalize is idempotent by `job_id`.** Result handling runs in a transaction
   guarded by the job row: `UPDATE processing_jobs SET status=…, finished_at=…
   WHERE id = job_id AND status = 'queued'`. If zero rows update, the result is a
   duplicate → skip. Only the first result writes variants/attributes and moves
   the photo status.
2. **Variant writes upsert** on `(photo_id, variant_type)` with a **deterministic
   object key** `variants/{photo_id}/{variant_type}.jpg`. Regeneration overwrites
   the same MinIO object — no orphans — and the upsert refreshes
   `width/height/size`.
3. **Attributes** are written by `photo_id` (`UPDATE … WHERE id = photo_id`),
   naturally idempotent.
4. **Worker claim via MinIO object metadata.** Before the expensive
   resize/encode, the worker `HEAD`s the deterministic variant keys and reads
   `x-amz-meta-job-id`. If they already exist tagged with this `job_id` (a
   redelivery after a crash before ack), the worker **skips re-encoding** and
   reconstructs the result from the variant objects' metadata
   (`x-amz-meta-job-id`, `width`, `height`, plus `Content-Length`/`Content-Type`)
   and a cheap EXIF re-read of the original (header parse, no raster decode),
   then re-emits the result. No new infrastructure; the worker stays stateless,
   using MinIO (which it already talks to) as the claim store.

Accepted trade-offs (recorded as deliberate):

- The dominant cost (resize/encode) is never paid twice; a redelivery still pays
  a cheap EXIF re-read. No double billing, no orphan data.
- Concurrent/out-of-order reprocess is last-write-wins on the upsert —
  negligible for the single-flow MVP.
- `correlation_id` is for logs/trace only, never an idempotency key.

**Partial-failure isolation:** each photo is its own job/message; one photo's
failure (bad file, decode error) fails only its job → `failed`, and does not
affect other photos in the same upload batch.

## Variant Generation

- **Original is the immutable source of truth in its native format** — never
  transcoded or replaced. The worker reads it read-only.
- **Pipeline is input-format-agnostic by design.** 008 still accepts JPEG only
  on upload, but the decode step does not hardcode JPEG; adding HEIC/PNG/RAW
  later = extend accepted inputs + add a decoder, not a rewrite.
- **Variants are own-platform display renditions.** Current renditions:
  `thumbnail` (gallery rows) and `preview` (detail modal). The public-page
  `publish` rendition is deferred.
- Rendition rules (both variants): fit-within-box, **aspect preserved, no crop**;
  **no upscale**; **auto-orientation baked** into pixels (orientation tag
  removed); **EXIF stripped** from variants (privacy — NFR 4.4 — and smaller
  files).
- Sizes/format: `thumbnail` fit `320×320`; `preview` fit `1600×1600`; output
  **JPEG** (q≈80/82). `content_type` per variant keeps a later WebP/AVIF swap
  free and non-breaking (and operationally cheap via the reprocess seam).
- Implementation: **Pillow** now (pyvips is a later throughput swap).
- Variant object metadata on write: `x-amz-meta-job-id`, `x-amz-meta-width`,
  `x-amz-meta-height` (claim + cheap result reconstruction).

## EXIF Extraction

Extracted in the worker via `Image.getexif()` + GPS IFD parsing (a small library
such as `piexif`/`exifread` is acceptable if Pillow's GPS handling is awkward).

- **Promoted columns (basic set):** `width`, `height`, `taken_at_*`,
  `camera_make`, `camera_model`, `orientation`, `lat`, `lon`. Rich parameters
  (ISO, exposure, aperture, lens, focal length) are **not** promoted now but are
  captured losslessly in `metadata_json`; when the "analyze by shooting
  parameters" feature arrives they are promoted to columns and **backfilled from
  `metadata_json`** — no reprocess, no re-decode.
- **Raw metadata (`metadata_json`):** sanitized full EXIF — all readable tags;
  binary blobs (MakerNote, embedded thumbnail, binary UserComment) dropped;
  rationals normalized to numbers. Private by construction (photo-db is
  owner-scoped; variants strip EXIF; public pages use variants), satisfying
  "sensitive EXIF not public".
- **`taken_at` timezone model** (resolve to UTC when data suffices, otherwise
  keep local and leave the door open):
  - `taken_at_local` = EXIF `DateTimeOriginal` wall-clock, always set when
    present — never lossy.
  - `taken_at_utc` set, with `taken_at_tz_source`, when enough data exists:
    `OffsetTimeOriginal` present → `local − offset`, source `exif_offset`;
    else `GPSDateStamp`+`GPSTimeStamp` present (these are UTC per the EXIF spec —
    a tag read, not geocoding) → source `gps_time`.
  - Otherwise `taken_at_utc = null`, source `unknown`. Later resolution
    (user-supplied offset → source `user`; GPS-zone inference via reverse
    geocoding → presumptive, pending user confirmation) is supported by these
    columns without reprocess; those **flows and reverse geocoding are deferred**.
- **Defensive rules:** missing EXIF or GPS is **not** a failure (status still
  `ready`; `width/height` come from decode regardless). Malformed EXIF is parsed
  defensively — take what is valid, null the rest, log a warning with the
  correlation id, do not fail the job. GPS converted DMS+ref → signed decimal and
  range-validated (`lat∈[-90,90]`, `lon∈[-180,180]`); invalid → null.

## Delivery API

The UI cannot fake image delivery or per-photo detail; both are built here. The
contract additions are data + delivery only — no sort/filter/pagination params
(those are 009).

- **Owner-scoped presigned GET for variants.** `photo-service` generates
  short-lived presigned GET URLs for variant object keys; the gateway returns
  them to the owner. Originals stay private (no public direct URLs); the owner
  viewing their own preview is allowed.
- **`GetPhoto(photo_id)` RPC** (new): returns one `PhotoAsset` with attributes,
  status, and variant URLs — backs the detail modal.
- **`ListPhotos`** now returns extracted attributes, status, and variant URLs
  (at least thumbnail) per row. Existing user-scoping and ordering unchanged;
  `page_token` remains unimplemented (pagination is 009).
- **`api-gateway`** maps the new fields to camelCase and adds the `GET
  /photos/:id` route; `GET /photos` response gains the new fields.

## Observability

- Structured logs (JSON) across the async boundary with a **correlation id**
  generated at `CompleteUpload` and threaded through the job message, the
  worker, the result message, and finalize.
- The `processing_jobs` row's `started_at`/`finished_at` give job duration;
  `failed` rows and DLQ depth give failure/queue-lag signals. This is the NFR
  4.2 surface needed to debug async jobs.

## Usage Readiness (emission deferred)

008 emits **no** usage events and builds no usage contract (usage-service does
not exist yet; `photo-service` cannot write `usage-db`; inventing the usage
schema now is premature). It is made usage-ready by construction: the billable
facts are durably and attributably recorded — `processing_jobs` (per-run, typed,
`succeeded|failed`, timestamped), `photo_variants.size_bytes`, and
`photo_assets.size_bytes`. When usage-service lands it derives `BillingEvent`s
charge-once by `job_id`, fed by domain events `photo-service` will publish then
(or an API) — that emit-vs-pull choice and event schema are the usage stage's,
respecting DB-ownership (usage-service cannot read photo-db directly).

## Reprocessing Seam (feature deferred)

System retry (AMQP N=3 + DLQ) is **not** reprocessing — it is the same `job_id`,
the same run. **Intentional reprocessing** is a distinct use-case: shared
processing core (resize + EXIF), but its own queue/routing key, its own event
types (inheriting the original payloads), a new `job_id`, `type = reprocess`,
and separate billing. 008 ships only the `initial` path; the seam is left ready
(typed jobs, shared core, per-run `job_id`) so adding `reprocess` later is a new
use-case handler + queue, not a refactor.

## Testing Strategy

- **Unit (pure):** variant sizing (fit / no-crop / no-upscale across
  portrait/landscape); EXIF parse edge cases (missing, malformed, GPS DMS→decimal
  + range validation); `taken_at` resolution (offset present, GPS-time present,
  neither); idempotent finalize guard; variant upsert.
- **Component (fake broker + fake/temp MinIO):** worker consume → process →
  publish; photo-service publish + consume-result + DB writes. Uses the in-memory
  transport adapter — no real broker.
- **Reliability:** duplicate result delivery charges once (one variant set, one
  status move); worker-claim skip on job redelivery (no second encode);
  processing failure → `failed` + dead-letter; one photo in a batch fails, others
  reach `ready`.
- **Integration (docker: RabbitMQ + MinIO + photo-db):** upload → complete →
  processing → ready with real variants; owner presigned GET returns the preview;
  a forced reprocess (test-only trigger) does not duplicate variant rows.

## Decisions (log)

1. **Result contract = result queue** (not a gRPC callback). Result writes are
   inherently async; a queue keeps one transport and uniform reliability, and
   keeps the worker AMQP-only. proto defines the payloads.
2. **Topology:** two durable queues, persistent messages, ack-on-success, retry
   N=3 → DLQ.
3. **Idempotency by convergent state + claim:** `processing_jobs` run record,
   charge-once by `job_id`, `(photo_id, variant_type)` upsert, worker-claim via
   MinIO metadata. No message-dedup ledger.
4. **Variants = own-platform browse/detail renditions;** immutable original;
   format-agnostic pipeline; 320/1600 JPEG, fit-no-crop-no-upscale, auto-orient,
   strip-EXIF; `target` seam named, not built.
5. **Usage emission deferred;** 008 usage-ready via run record + sizes.
6. **EXIF:** basic promoted columns + full sanitized raw json; `taken_at` as
   local/utc/source with UTC-when-resolvable.

ADR candidate: this session realizes the recommended **ADR-002 "async image
processing instead of request-time processing"** (`project_description.md` §10);
an ADR should be written alongside implementation.

## Open Questions

None blocking. Names (exchanges, queues, routing keys, the new proto module
path) are finalized during planning; they are adapter/config details and do not
affect the contracts above.
