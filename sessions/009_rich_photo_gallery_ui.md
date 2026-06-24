# Session 009: Rich Photo Gallery UI (Planned)

Status: **Planned — not started.** Forward-looking stub; the full brief,
accepted spec, and plan are written when the session begins. **Depends on
session 008** (`sessions/008_media_processing_async_skeleton.md`), which lands
the statuses, extracted attributes, variant delivery, and detail API this UI
consumes.

## Goal

Implement the two driving user stories as a real UI on top of the data and
delivery built in session 008:

> - A user can view a table of their photos' processing statuses.
> - A user can view a table of their uploaded photos with extracted
>   attributes; clicking a row opens a modal with detail and a preview.

Today the photo list is a plain `<ul>` showing only filename + status. This
session turns it into a real photo gallery.

## Scope (sketch)

- Adopt a rich UI component library (shadcn/ui per the stack in
  `project_description.md` §5).
- A **live table** of the user's photos: sortable columns, filters (e.g. by
  status), and pagination, with a status column (covers story 1 + the story 2
  table).
- **Row click → modal** with detailed info and a **preview** image
  (story 2), served from the owner-scoped presigned GET variant URLs from 008.
- Add the **thin query parameters** (sort/filter/pagination) to `ListPhotos`
  here — designed against this concrete UI rather than guessed in 008.
- UX states: empty / loading / error (per `project_description.md` Day 12).

## Depends on (delivered by session 008)

- Real status progression (`uploaded → processing → ready | failed`).
- Extracted attributes on `PhotoAsset` (dimensions, `taken_at`, camera, GPS).
- `PhotoVariant` + owner-scoped presigned **GET** delivery for preview/thumbnail.
- `GetPhoto(id)` detail RPC and attributes/status/variant URLs on `ListPhotos`.

## Out of scope

- Backend processing, EXIF/variant generation, async contracts (all in 008).
- Reverse geocoding / human-readable location (still deferred after 008).
- Clustering, story/publication, usage dashboard, map rendering.

## References

- Backend foundation: `sessions/008_media_processing_async_skeleton.md`.
- `project_description.md` §3.2, §3.3, §5 (frontend stack); `docs/domain-model.md`.
