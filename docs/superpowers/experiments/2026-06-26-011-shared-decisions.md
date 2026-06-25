# Session 011 — shared decisions (A/B experiment input)

Date: 2026-06-26 · Purpose: the **forks resolved** for the photo-gallery feature
— NOT the design. Feed this verbatim into the other A/B arms ("superpowers
without the napильник", "no superpowers") so every arm builds the **same
product** and the only variable is the **method**. Each item is a decision +
the rejected alternative, so a different arm reaches the same product surface
without re-deciding scope.

The two-driving stories (fixed, from `project_description.md` / `sessions/011`):
> - A user can view a table of their photos' processing statuses.
> - A user can view a table of uploaded photos with extracted attributes;
>   clicking a row opens a modal with detail and a preview.

## Decisions (fork → choice → rejected)

1. **Scope = full brief, server-side query.** Implement sort/filter/pagination
   **server-side** on `ListPhotos` (proto → photo-service → api-gateway → web),
   not client-side over the already-returned page. *Rejected:* web-only
   client-side filtering over the ≤100-item page.

2. **Verification bar = component tests + live UI smoke.** jsdom component tests
   (vitest + @testing-library/react) as the behavior oracle, **plus** a live
   Playwright UI smoke against the Docker stack, plus a manual e2e scenario,
   plus a final native `/code-review`. *Rejected:* component tests only.

3. **Pagination contract = offset/page + total_count.** Request `page` (1-based)
   + `page_size`; response adds `total_count` (for "page N of M" + page-jump).
   Reserve the unimplemented cursor fields. *Rejected:* implement the existing
   `page_token`/`next_page_token` cursor (no total/page-jump; awkward with
   arbitrary sort).

4. **Sort/filter surface = the richer one.** `sort_by ∈ {created_at, taken_at,
   filename, size_bytes}` + `sort_dir`; **multi-status** filter; case-insensitive
   **filename substring** search. *Rejected:* leaner (sort created_at|taken_at +
   single status only).

## Ratified recommendations (controller-proposed, approved with the design)

These are not user forks but were locked so the arms match:

- **UI library:** shadcn/ui + Tailwind (v4 CSS-first acceptable). Table is
  **hand-rolled** over server-driven state — **no** `@tanstack/react-table`
  (server-side data; local React state suffices; no URL-state sync).
- **Freshness:** poll the current page while any visible photo is
  uploading/processing; stop when all settle. No websockets/SSE.
- **Detail modal:** re-fetch `GetPhoto(id)` on open (fresh short-lived presigned
  preview URL) rather than reusing the list row's (possibly expired) URL.
- **No DB migration:** sort/filter/paginate use existing columns + the
  `user_created_at` / `status` indexes. List-SQL correctness is verified by the
  live smoke + manual e2e, **not** an in-process DB test (testcontainers is a
  separate session, `photo_ops-4vg`).
- **Columns:** thumbnail, filename, status (badge), taken_at, dimensions (W×H),
  camera, size, created_at; missing attributes render an em-dash fallback.

## Backend dependency (fixed precondition for all arms)

Session 008 is on `main`: `api-gateway` already serves enriched `GET /photos`
(status + width/height/taken_at*/camera/orientation/lat/lon/variants, pageSize
100) and `GET /photos/:id`; variant URLs are owner-scoped presigned GETs. The
gallery is essentially a web slice **plus** the server-side query params from
decision #1. The web client (pre-011) only typed the old `PhotoAsset` fields and
rendered a `filename + status` `<ul>`.
