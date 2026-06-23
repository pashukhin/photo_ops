# Session 007: Async Media-Processing Skeleton (Planned)

Status: **Planned — not started.** This is a forward-looking stub; the full
brief, accepted spec, and plan are written when the session begins.

## Goal

Land the first **async workflow** and the first real behavior in the Python
`media-worker`, as a thin vertical slice — following the project's
thin-slice philosophy (sessions 001–002) rather than building all of roadmap
stage 3 at once.

Target slice:

> Upload completes → a processing job is published to RabbitMQ → the Python
> `media-worker` consumes it → generates a thumbnail and a preview → the
> `PhotoVariant` records are written → the asset status moves
> `uploaded → processing → ready`.

Reliability is part of the slice (NFR 4.3): jobs are idempotent, a single
photo's failure does not break the batch, reprocessing does not create
duplicate variants, and failures surface as `failed`.

## Scope (sketch)

- First async contract over RabbitMQ (kept minimal — do not over-design it).
- `media-worker` real consumer: image resize via Pillow/pyvips, auto-orientation.
- New entity `PhotoVariant` (`thumbnail`, `preview`) + status machine on `PhotoAsset`.
- Fold in **structured logging + correlation id (`photo_ops-zg6`)** — it is the
  NFR you need to debug jobs (job duration / failures / queue lag) and this is
  the session where async makes it pay for itself.

## Deferred to a later session (not in this slice)

- EXIF extraction, `taken_at`, GPS extraction (stage 3.3 remainder).
- Reverse geocoding / `Location` normalization (stage 3.4) — see
  `photo_ops-3iy`; clustering works without it.
- The `publish` variant type (only needed at publication time).

## Open decisions (resolve at brainstorming — architecture-sensitive)

- **Who writes `photo-db`?** Architecture invariant: a service connects only to
  its own DB, and `photo-service` owns `photo-db`. So the `media-worker` should
  most likely **report results back to `photo-service`** (which records
  `PhotoVariant` + status) rather than writing `photo-db` directly. Confirm the
  contract direction (worker → photo-service callback/queue vs worker writing a
  store it owns).
- **Queue shape** — exchange/queue/routing names; ack/retry/dead-letter policy.
- **Idempotency key** — per-photo? per-variant? how reprocessing is detected.
- **Variant sizing** — thumbnail/preview dimensions and format.
- Whether to emit `usage` events (`photo_variant_generated`, `photo_processed`)
  now or defer to the usage-accounting stage.

## Out of scope

- Clustering, story/publication, usage dashboard.
- Any product feature beyond the upload→processing→ready path.

## References

- `project_description.md` §3.3, §4.3; `docs/roadmap.md` (stage 3); `docs/domain-model.md`.
- Architecture boundaries: `docs/architecture.md` (DB ownership, MinIO privacy, async-later).
