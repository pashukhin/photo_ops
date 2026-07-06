# api-gateway

## Local context

- NestJS HTTP edge for the browser; the only backend `web` calls (except presigned MinIO URLs).
- Calls identity-service via `IdentityClient` (`src/grpc/identity.client.ts`) and photo-service via `PhotoClient` (`src/grpc/photo.client.ts`); both load proto files at startup and connect over insecure gRPC using `IDENTITY_SERVICE_GRPC_URL` / `PHOTO_SERVICE_GRPC_URL`.
- Calls cluster-service via `ClusterClient` (`src/grpc/cluster.client.ts`, `CLUSTER_SERVICE_GRPC_URL`, default `cluster-service:50057`); `ClusterController` (`src/http/cluster.controller.ts`) exposes session-authed `POST /v1/clusters/generate`, `GET /v1/clustering-methods`, `GET /v1/clustering-results`, `GET /v1/clustering-results/:resultId` and maps proto status/kind enums to strings + flattens node items.
- `GET /photos` (session 011) parses the gallery query (`page`, `pageSize`, `sort`, `dir`, repeated `status`, `q`) into the numeric `ListPhotosInput` (the client is `enums:Number`) and returns `{ photos: [...mapPhoto], totalCount }`; `GET /photos/:photoId` returns the mapped `GetPhoto` detail. `mapPhoto` maps the proto status enum to a string and strips proto3 synthetic `_`-prefixed presence fields.
- Calls publication-service via `PublicationClient` (`src/grpc/publication.client.ts`, `PUBLICATION_SERVICE_GRPC_URL`); `PublicationController` (`src/http/publication.controller.ts`) exposes session-authed `POST/GET/PATCH /v1/posts` and maps proto status/visibility enums ↔ strings via an explicit browser DTO (no `...raw` spread). On `PATCH` it validates at the edge (session 018 / 4o2): visibility ∈ {private,unlisted,public} else 400, `date_from`/`date_to` must be ISO-parseable (`""` clears) else 400; a present `photos` list (replace-all `{photoId,caption}[]`) is wrapped into the gRPC `PostPhotoList` message by the client.
- Session cookie is HTTP-only (name from `IDENTITY_SESSION_COOKIE_NAME`, default `photoops_session`); set/cleared in `src/auth/session-cookie.ts` via `serializeSessionCookie` / `serializeClearedSessionCookie`; `AuthService` (`src/auth/auth.service.ts`) validates the session on each authenticated request.
- CORS origin(s) from `WEB_ORIGIN` (comma-separated) configured in `src/cors.ts`; HTTP and gRPC errors mapped to JSON responses by `HttpErrorFilter` in `src/errors/http-error.filter.ts`.
- Logging / correlation: structured JSON via `nestjs-pino`, configured by `makePinoHttpOptions` from `@photoops/observability` (which wraps `makeLoggerOptions` — redaction + trace_id/span_id mixin); OTel propagation started in `src/tracing.ts`; HTTP requests auto-logged; mapped errors logged by `HttpErrorFilter` (4xx warn / 5xx error).
- Tests: `vitest run` (`make test-api`).
- Typecheck: `tsc --noEmit` (`make typecheck` runs it across all services).

## Local invariants

- Must not connect to any database. All persistence goes through identity-service / photo-service gRPC calls.
- Sync service contracts are proto-first; regenerate types with `make proto` after proto edits.
- The session cookie is HTTP-only and is issued/cleared through this gateway.
