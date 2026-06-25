# Rich Photo Gallery UI — Skeleton Commit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> to fill this skeleton task-by-task — each task makes its RED tests green within
> the provided stubs. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the plain filename+status `<ul>` into a real photo gallery on the
008 backend: a server-side sortable/filterable/paginated table with a status
column, row-click → detail modal with a working preview, and empty/loading/error
states.

**Architecture / WHY:** Server owns sort/filter/pagination (the web holds the
query in local state, sends it, renders the returned page + `totalCount`). The
proto contract is the single source of truth for the query shape; the gRPC
controllers are the proto↔domain boundaries (defaults, clamps, enum mapping).
Entry points — contract → `proto/photo/v1/photo_service.proto` (+ regenerated
`packages/proto-ts/src/photo/v1/photo_service.ts`); domain types →
`apps/photo-service/src/photo/photo.types.ts`; behavior →
the `*.spec.ts(x)` files named per task; UI behavior oracle →
`apps/web/components/gallery/PhotoGallery.spec.tsx`. Durable why/invariants go to
`docs/adr` at the end of the session (not restated here — Principle 7).

**Tech Stack:** proto3 + ts-proto; NestJS gRPC (`@grpc/proto-loader`, enums
decode as **numbers** server-side); Drizzle/Postgres; Next.js 15 / React 19;
vitest + @testing-library/react (jsdom); shadcn/ui + Tailwind; Playwright (live
smoke).

## Global Constraints

- No new DB migration: sort/filter/paginate use existing columns; the
  `photo_assets_user_created_at_idx` + `photo_assets_status_idx` indexes suffice
  at MVP scale (taken_at/filename/size sorts are seq scans — acceptable; add
  indexes only if the per-user photo count grows).
- `make proto-check` must stay green: any further `.proto` edit requires
  `make proto` + committing the regenerated `packages/proto-ts`.
- `make gate` must be green before the final push (the skeleton commit itself is
  intentionally RED; gate goes green as tasks are filled).
- Pagination contract: offset/`page` (1-based) + `page_size` + `total_count`
  (the unimplemented cursor fields were reserved).
- Sort/filter surface: `sort_by ∈ {created_at, taken_at, filename, size_bytes}`
  + `sort_dir`; multi-`status` filter; `filename_query` (case-insensitive
  substring).

## Non-Goals

- No reverse geocoding / human-readable location (`photo_ops-3iy`).
- No clustering, publication, usage dashboard, map rendering.
- No in-process DB test of the list SQL (testcontainers is `photo_ops-4vg`, its
  own session); the SQL's correctness oracle is the live UI smoke + manual e2e.
- No `@tanstack/react-table` (server-side data; local React state is enough).
- The data-seeded UI smoke path (upload → open modal → preview) is out of scope;
  the thin smoke asserts the gallery renders for a fresh user (see Task 8).

## Skeleton Guardrails (apply to every task)

- The RED tests are guarded: you may **add** narrower tests; you may not weaken,
  delete, rename-away, or change the expected behavior of a skeleton test.
- Spec-change protocol: if filling a stub proves the skeleton is wrong, **stop**
  → write a spec-change note (which executable artifact changes and why) → get
  human/strong-model approval → update the skeleton + re-run RED → continue. Do
  not silently mutate the contract or a test.
- Architecture-sensitive tasks (1–3, the proto-touching slice) get a full
  dual-verdict review; mechanical tasks (4–6) are task-local (green + typecheck),
  with one whole-branch review + the live smoke at the end.

---

### Task 1: photo-service repository list query (architecture-sensitive)

**Files:** `apps/photo-service/src/photo/photo.repository.ts` (`list` stub).
No unit test (no in-process DB this session).

**GREEN obligation:** implement `list(params: ListPhotosParams)` →
`{ rows, totalCount }`: one query scoped to `params.userId` (status `IN`
`params.statusFilter` when non-empty; filename `ILIKE %params.filenameQuery%`
when non-empty) ordered by the column mapped from `params.sortBy` in
`params.sortDir`, `LIMIT params.pageSize OFFSET (params.page - 1) * params.pageSize`;
plus a `COUNT(*)` over the same filter for `totalCount`.

- [ ] Implement the query + count; verify via `make smoke-ui` / manual e2e (SQL
  has no unit test by design — documented trade-off).

### Task 2: photo-service service + gRPC controller (architecture-sensitive)

**Files:** `apps/photo-service/src/photo/photo.service.ts` (`listPhotos` stub),
`apps/photo-service/src/photo/photo.grpc.controller.ts` (`listPhotos` stub).
**RED tests:** `photo.service.spec.ts`, `photo.grpc.controller.spec.ts`
(`ListPhotos (session 011 query mapping)`).

**GREEN obligation:** service composes repo rows with presigned variant views
(preserve the existing grouping) and threads `totalCount`; controller maps the
proto request (numeric enums) onto `ListPhotosParams` with the documented
defaults/clamps and returns `{ photos: …map(toProtoPhoto), totalCount }`.

- [ ] Make both spec files green; `pnpm --filter @photoops/photo-service test`.

### Task 3: api-gateway query passthrough (architecture-sensitive)

**Files:** `apps/api-gateway/src/http/photo.controller.ts` (`listPhotos` stub),
`apps/api-gateway/src/grpc/photo.client.ts` (types already widened).
**RED tests:** `photo.controller.spec.ts` (session 011 cases).

**GREEN obligation:** parse the HTTP query (`page,pageSize,sort,dir,status×N,q`)
into a `ListPhotosInput` (numeric proto enums; `status` string|string[] →
ordered numeric array), call the client, return
`{ photos: …map(mapPhoto), totalCount }`.

- [ ] Make the spec green; `pnpm --filter @photoops/api-gateway test`.

### Task 4: web API client (mechanical)

**Files:** `apps/web/lib/api.ts` (`listPhotos`, `getPhoto` stubs).
**RED tests:** `apps/web/lib/api.spec.ts` (session 011 cases).

**GREEN obligation:** `listPhotos(params)` builds the query string (`?…` only
when a param is present; one `status=` per value) and returns `{ photos,
totalCount }`; `getPhoto(id)` GETs `/photos/:id`. Credentialed requests.

- [ ] Make the spec green; `pnpm --filter @photoops/web test`.

### Task 5: adopt shadcn/ui + Tailwind (infra; mechanical)

**Files:** `apps/web` — Tailwind config + `globals.css` + `components.json` +
`lib/utils.ts` (cn) + vendored shadcn primitives (table, dialog, select/
dropdown, badge, button, input, skeleton). Smallest working setup for Next 15 /
React 19 (Tailwind v4 CSS-first or v3 — implementer picks the path that builds;
Principle 2).

**GREEN obligation:** `pnpm --filter @photoops/web build` + `typecheck` stay
green; existing + gallery tests unaffected (behavior tests are widget-agnostic).
Prereq for styling Task 6 — not for its behavior tests.

- [ ] Wire Tailwind/shadcn; `pnpm --filter @photoops/web build`.

### Task 6: gallery components (UI)

**Files:** `apps/web/components/gallery/` — `PhotoGallery.tsx` (container),
`PhotoTable.tsx`, `PhotoDetailModal.tsx`, `StatusBadge.tsx`, `GalleryToolbar.tsx`,
`GalleryPagination.tsx` (typed stubs; prop interfaces are the contracts — internal
decomposition may be adjusted as long as `PhotoGallery.spec.tsx` stays green).
**RED tests:** `apps/web/components/gallery/PhotoGallery.spec.tsx` (7 cases).

**GREEN obligation:** make all `PhotoGallery.spec.tsx` cases green — rows +
columns + status badge + `—` fallback; row click → `role="dialog"` modal with
the preview image + detail (re-fetched via `getPhoto`); search + pagination
re-query server-side; loading/empty/error states; poll every `GALLERY_POLL_MS`
while a photo is processing and stop when settled; refetch on `reloadToken`
change. Style with shadcn from Task 5.

- [ ] Make the spec green; `pnpm --filter @photoops/web test`.

### Task 7: page wiring (done in the skeleton)

`apps/web/app/page.tsx` already renders `<PhotoGallery reloadToken={…}/>` and
bumps `reloadToken` after upload. No further work unless a test demands it.

### Task 8: live UI smoke (finish; infra)

**Files:** `apps/web/smoke/gallery.smoke.ts`, `apps/web/playwright.config.ts`,
`scripts/smoke-ui.sh`, `make smoke-ui` (all scaffolded).

**GREEN obligation:** with the stack up, `make smoke-ui` (installs chromium on
first run) passes — a fresh user signs up and sees the gallery empty state +
search control.

- [ ] Run `make smoke-ui` against the running stack once the UI is green.

---

## Finish (after all tasks green)

- [ ] Update nested `CLAUDE.md` (web / api-gateway / photo-service) to the real
  ListPhotos contract + gallery structure.
- [ ] `make gate` green; write the ADR (the "why"); record metrics +
  kill-criterion verdict + retro in `sessions/011_rich_photo_gallery_ui.md`.
- [ ] `merge --no-ff` + tag `exp/exec-spec-011`; native `/code-review`.
