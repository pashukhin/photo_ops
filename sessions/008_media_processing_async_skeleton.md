# Session 008: Media-Processing Backend (async + EXIF/GPS + variant delivery)

Status: **In planning.** Design is being brainstormed; the accepted spec and
plan land under `docs/superpowers/specs` and `docs/superpowers/plans` before
implementation. The UI that consumes this backend is split into **session 009**.

## Why this shape

The two driving user stories are UI-facing:

> - A user can view a table of their photos' processing statuses.
> - A user can view a table of their uploaded photos with extracted
>   attributes; clicking a row opens a modal with detail and a preview.

Both are a **UI showcase of backend capabilities that do not exist yet**:
statuses never move past `uploaded`, there is no image-delivery path back to
the browser, and no extracted attributes are stored. So we build the backend
foundation first (this session) and the rich UI on top of real data
(session 009). This session deliberately builds **all the data and delivery**
the UI needs, but **not** the query ergonomics (sort/filter/pagination) — those
are designed against the concrete UI in 009 to avoid guessing the contract.

## Goal

Land the first **async workflow** and the first real behavior in the Python
`media-worker` as a thin vertical slice, producing the data and delivery the
photo gallery UI will consume:

> Upload completes → a processing job is published to RabbitMQ → the Python
> `media-worker` consumes it → auto-orients, generates a thumbnail and a
> preview, extracts EXIF (taken_at, camera, orientation, GPS coordinates) →
> reports the result back to `photo-service` → `PhotoVariant` records and the
> extracted attributes are written → the asset status moves
> `uploaded → processing → ready` (or `failed`).

Reliability is part of the slice (NFR 4.3): jobs are idempotent, a single
photo's failure does not break the batch, reprocessing does not create
duplicate variants, and failures surface as `failed`.

## Scope

- First async contract over RabbitMQ (kept minimal — do not over-design it).
- `photo-service` as **producer**: publishes a processing job on `CompleteUpload`.
- `media-worker` real consumer: download original from MinIO, auto-orientation,
  image resize via Pillow/pyvips (thumbnail + preview), EXIF extraction
  (`taken_at`, camera make/model, orientation, GPS `lat`/`lon`), raw metadata.
- Worker **reports results back to `photo-service`** (it does not write
  `photo-db`; see Open decisions). `photo-service` records `PhotoVariant`,
  attributes, and status.
- New entity `PhotoVariant` (`thumbnail`, `preview`) + new `PhotoAsset` columns
  (`width`, `height`, `taken_at`, `lat`, `lon`, `camera_make`, `camera_model`,
  `orientation`, `metadata_json`) + status machine `uploaded → processing →
  ready | failed`.
- **Delivery API:** presigned **GET** for variants, owner-scoped (preview /
  thumbnail URLs); `GetPhoto(id)` detail RPC; `ListPhotos` returns extracted
  attributes, status, and variant URLs. HTTP wiring in `api-gateway`.
- **Structured logging + correlation id (`photo_ops-zg6`)** — the NFR needed to
  debug jobs (job duration / failures / queue lag) across the async boundary.

## Deferred to a later session (not in this slice)

- **Reverse geocoding / `Location` normalization (stage 3.4)** — we store GPS
  `lat`/`lon` only; the human-readable geo hierarchy is deferred (see
  `photo_ops-3iy`; clustering works without it).
- **Query ergonomics** (sorting, filtering, pagination params on `ListPhotos`)
  — designed in session 009 against the concrete UI.
- The `publish` variant type (only needed at publication time).
- Whether to emit `usage` events (`photo_variant_generated`, `photo_processed`)
  now or defer — see Open decisions.

## Open decisions (resolve in the spec — architecture-sensitive)

- **Result contract direction** — worker → `photo-service`: dedicated result
  queue vs gRPC callback. (Invariant: only `photo-service` writes `photo-db`.)
- **Queue shape** — exchange/queue/routing names; ack/retry/dead-letter policy.
- **Idempotency key** — per-photo? per-variant? how reprocessing is detected.
- **Variant sizing** — thumbnail/preview dimensions and format.
- **EXIF specifics** — exact field set and raw-metadata storage shape.
- **Usage events** — emit now or defer to the usage-accounting stage.

## Out of scope

- Clustering, story/publication, usage dashboard.
- The rich gallery UI (session 009).
- Any product feature beyond the upload→processing→ready path and the data/API
  needed to display it.

## References

- `project_description.md` §3.3, §4.3; `docs/roadmap.md` (stage 3); `docs/domain-model.md`.
- Architecture boundaries: `docs/architecture.md` (DB ownership, MinIO privacy, async-later).
- Follow-up UI session: `sessions/009_rich_photo_gallery_ui.md`.
