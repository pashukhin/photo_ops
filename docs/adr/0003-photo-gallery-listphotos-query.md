# ADR 0003 — Rich photo gallery: ListPhotos query shape & verification trade-offs

Date: 2026-06-26 · Status: accepted · Session: 011 (`photo_ops-8k9`)

Context: session 011 turns the plain filename+status list into a real gallery
(sortable/filterable/paginated table + detail modal + preview) on the 008
backend, executed as the executable-spec / skeleton-first SDD experiment
(`docs/agent-workflow-evolution.md`). This ADR records only the durable *why*
and the rejected alternatives — the contract itself lives in
`proto/photo/v1/photo_service.proto` and the behavior in the test files.

## Decisions

1. **`ListPhotos` pagination = offset/`page` + `page_size` + `total_count`;
   the unimplemented cursor fields were `reserved`.** A sortable/filterable
   table needs "page N of M" and page-jump, which cursor pagination
   (`page_token`/`next_page_token`) does not give, and cursors compose poorly
   with an arbitrary sort key. The proto already carried cursor fields but they
   were dead (only `LIMIT` was honored), so repurposing them cost no behavior.
   *Rejected:* implementing the existing cursor (smaller proto diff, worse UX).

2. **Sort/filter/pagination are server-side**, designed here against the
   concrete UI. 008 deliberately deferred the query ergonomics to avoid guessing
   the contract; the UI is what defines it. Surface: `sort_by ∈
   {created_at, taken_at, filename, size_bytes}` + `sort_dir`, multi-`status`
   filter, case-insensitive `filename_query`. The gRPC controller owns the
   proto↔domain boundary (numeric-enum mapping, defaults, pageSize clamp 1..100).

3. **The list SQL is verified by the live UI smoke + manual e2e, not an
   in-process DB unit test.** Hermetic DB tests (testcontainers) are their own
   session (`photo_ops-4vg`); pulling them in here would be scope creep. The
   query-param plumbing *is* unit-pinned at every boundary (web → gateway →
   service/controller with fake repos); only the Drizzle SQL itself relies on the
   smoke against real Postgres. Accepted trade-off (Principle 5), recorded so it
   is a choice, not an oversight.

4. **UI behavior tests are widget-agnostic.** Search and pagination are pinned in
   jsdom (`PhotoGallery.spec.tsx`); the status-filter and sort *widgets* are
   verified end-to-end by `make smoke-ui`, not jsdom. The visual form is the
   exploratory lane — pinning widget mechanics in unit tests would freeze the
   form prematurely and couple the spec to Radix internals. The data contract
   they drive is still fully pinned at the api/gateway layers.

5. **Freshness via polling, not realtime.** `PhotoGallery` re-polls `listPhotos`
   every `GALLERY_POLL_MS` while any visible photo is uploading/processing and
   stops once all settle. Simplest thing that works; websockets/SSE are YAGNI at
   this stage.

6. **UI stack = Tailwind v4 (CSS-first) + shadcn/ui vendored under
   `components/ui/`.** Matches `project_description.md` §5; smallest setup that
   builds on Next 15 / React 19. ESLint is the single root `make lint`; `next
   build` does not run its own pass (`eslint.ignoreDuringBuilds`).

## Non-goals (negative space)

Reverse geocoding / human-readable location (`photo_ops-3iy`); clustering,
publication, usage dashboard, map rendering; `@tanstack/react-table` (server-side
data — local React state suffices); a data-seeded UI smoke (upload → modal →
preview), left as a follow-up.
