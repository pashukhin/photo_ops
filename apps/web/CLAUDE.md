# web

## Local context

- Next.js app for authenticated upload/list; runs on `WEB_PORT` (default 3000).
- Calls api-gateway via `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:3001`); all HTTP calls are in `lib/api.ts`.
- Upload flow: browser calls `POST /photos/upload-intents` on api-gateway to get a presigned `uploadUrl`, then does a direct `PUT` to that MinIO URL (`uploadFileToPresignedUrl`), then calls `POST /photos/{id}/complete-upload` on api-gateway to finalize.
- Tests: `vitest run` (`make test-web`).

## Local invariants

- Talks only to `api-gateway`, except for presigned MinIO upload URLs (direct browser-to-MinIO PUT).
- Does not hold its own database or business state; the gateway is the source of truth.
