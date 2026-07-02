# web

## Local context

- Next.js app for authenticated upload + the rich photo gallery; runs on `WEB_PORT` (default 3000).
- Calls api-gateway via `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:3001`); all HTTP calls are in `lib/api.ts` (`listPhotos(params) → {photos, totalCount}`, `getPhoto(id)`, auth + upload).
- Gallery (session 011) lives in `components/gallery/`: `PhotoGallery` (container — owns the query state, fetches via `listPhotos`, polls every `GALLERY_POLL_MS` while a photo is uploading/processing, refetches on `reloadToken` change) composes `GalleryToolbar` (search/status/sort), `PhotoTable`, `GalleryPagination`, and `PhotoDetailModal` (lazy-mounted; re-fetches `getPhoto` for a fresh presigned preview). Sort/filter/pagination are server-side. `app/page.tsx` renders `<PhotoGallery reloadToken>` and bumps the token after an upload.
- UI library: Tailwind (v4, CSS-first in `app/globals.css`) + shadcn/ui primitives vendored under `components/ui/` (`cn` in `lib/utils.ts`). `next build` does not run ESLint (`next.config.js` `eslint.ignoreDuringBuilds`); the one canonical lint is root `make lint`.
- Upload flow: browser calls `POST /photos/upload-intents` on api-gateway to get a presigned `uploadUrl`, then does a direct `PUT` to that MinIO URL (`uploadFileToPresignedUrl`), then calls `POST /photos/{id}/complete-upload` on api-gateway to finalize.
- Clustering UI (session 013) lives in `components/clusters/`: `ClusterView` (container — fetches `listClusteringResults` + `listClusteringMethods`, offers a method picker + Generate which `generateClusters` then polls `getClusteringResult` every `CLUSTER_POLL_MS` until it leaves `pending`, and renders a chosen result's immutable tree as a nested list). `app/clusters/page.tsx` renders `<ClusterView />`. Clustering client calls live in `lib/api.ts`.
- Tests: `vitest run` (`make test-web`) in jsdom with `@testing-library/react` (config `vitest.config.ts`, setup `vitest.setup.ts`); component behavior (render, click, modal, polling with fake timers) is exercised there. The live UI smoke (`smoke/gallery.smoke.ts`, Playwright) runs via `make smoke-ui` against a running stack — excluded from vitest, not part of `make gate`.
- Typecheck: `tsc --noEmit` (`make typecheck` runs it across all services).

## Local invariants

- Talks only to `api-gateway`, except for presigned MinIO upload URLs (direct browser-to-MinIO PUT).
- Does not hold its own database or business state; the gateway is the source of truth.
