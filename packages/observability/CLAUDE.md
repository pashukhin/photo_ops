# observability

## Local context

- Shared observability layer for the TypeScript services (api-gateway,
  identity-service, photo-service). Single source of truth for structured
  logging + OpenTelemetry context propagation. Added in session 010 (`zg6`).
- Exports (see `src/index.ts`):
  - `makeLoggerOptions(serviceName)` — pino options: level from `LOG_LEVEL`,
    `base.service`, a mixin that stamps `trace_id`/`span_id` from the active OTel
    context, and the `REDACT_PATHS` redaction list (censor `[REDACTED]`).
  - `makePinoHttpOptions(serviceName)` — the same options typed for
    `nestjs-pino`'s `pinoHttp`; this is what the services pass to
    `LoggerModule.forRoot`. Use this in service wiring (avoids the
    pino→pino-http cast).
  - `REDACT_PATHS`, `traceMixin` — the redaction list and the mixin, exported
    for tests/reuse.
  - `startTracing(serviceName)` — propagation-only OTel bootstrap (see
    invariants). Import it FIRST in each service's `src/tracing.ts`, which is
    the first import of `main.ts`.
  - `currentTraceparent()` / `withExtractedContext(traceparent, fn)` — the
    AMQP-bridge helpers photo-service uses to carry/restore trace context across
    the RabbitMQ hop via the proto `correlation_id` field.
  - `GrpcLoggingInterceptor` — one structured line per gRPC RPC; identity/photo
    register it in `main.ts` (`app.useGlobalInterceptors`).
- Buildable package: `main: dist/index.js`, `build: tsc -p tsconfig.build.json`.
  Specs (`*.spec.ts`) + `src/test-setup.ts` are excluded from the build.
  `pnpm -r build` builds it before its consumers (topological order).

## Local invariants

- **Propagation only.** `startTracing` registers a `NodeTracerProvider` with NO
  span processor and NO exporter, plus the W3C propagator and HTTP/gRPC/AMQP
  instrumentation. Spans exist in-memory to carry ids and propagate context;
  they are never exported. Adding an exporter/backend is `pb6`, not here.
- **One redaction list.** `REDACT_PATHS` is the only place secret paths are
  defined; never copy them into a service. Logs carry domain identifiers, not
  secret values — redaction is the safety net.
- **Runtime-consumable, unlike `proto-ts`.** This package is built and imported
  at runtime by the services, so the service Docker images MUST: (1) install
  with the `...` closure (`pnpm install --filter "@photoops/<svc>..."`) so this
  package's devDeps (e.g. `typescript`) are present for its `tsc` build, and
  (2) contain `packages/observability/dist` at runtime so the workspace symlink
  resolves. Single-stage Dockerfiles satisfy (2) for free. `make gate` does NOT
  build Docker — only `make smoke-stack` catches these. See `bd memories
  buildable-workspace-package-docker-gotcha`.
- Tests need a real OTel context manager (the default API is a no-op):
  `src/test-setup.ts` registers one via the package's vitest `setupFiles`.
