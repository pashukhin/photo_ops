# api-gateway

## Local context

- NestJS HTTP edge for the browser; the only backend `web` calls (except presigned MinIO URLs).
- Calls identity-service via `IdentityClient` (`src/grpc/identity.client.ts`) and photo-service via `PhotoClient` (`src/grpc/photo.client.ts`); both load proto files at startup and connect over insecure gRPC using `IDENTITY_SERVICE_GRPC_URL` / `PHOTO_SERVICE_GRPC_URL`.
- Session cookie is HTTP-only (name from `IDENTITY_SESSION_COOKIE_NAME`, default `photoops_session`); set/cleared in `src/auth/session-cookie.ts` via `serializeSessionCookie` / `serializeClearedSessionCookie`; `AuthService` (`src/auth/auth.service.ts`) validates the session on each authenticated request.
- CORS origin(s) from `WEB_ORIGIN` (comma-separated) configured in `src/cors.ts`; HTTP and gRPC errors mapped to JSON responses by `HttpErrorFilter` in `src/errors/http-error.filter.ts`.
- Logging / correlation: structured JSON via `nestjs-pino`, configured by `makePinoHttpOptions` from `@photoops/observability` (which wraps `makeLoggerOptions` — redaction + trace_id/span_id mixin); OTel propagation started in `src/tracing.ts`; HTTP requests auto-logged; mapped errors logged by `HttpErrorFilter` (4xx warn / 5xx error).
- Tests: `vitest run` (`make test-api`).
- Typecheck: `tsc --noEmit` (`make typecheck` runs it across all services).

## Local invariants

- Must not connect to any database. All persistence goes through identity-service / photo-service gRPC calls.
- Sync service contracts are proto-first; regenerate types with `make proto` after proto edits.
- The session cookie is HTTP-only and is issued/cleared through this gateway.
