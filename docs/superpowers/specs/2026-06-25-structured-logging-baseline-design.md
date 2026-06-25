# Structured Logging Baseline — Design

Date: 2026-06-25
Tracks: `photo_ops-zg6` (blocks `photo_ops-pb6`)
Session: `sessions/010_structured_logging_baseline.md`

## Problem

There is no structured or centralized logging. Diagnosis relies on `make logs`
over raw stdout: NestJS' default (unstructured) `Logger` in the three TS
services, and `logging.basicConfig(format="%(message)s")` in the Python
`media-worker`. A single user request cannot be followed across the
`web → api-gateway → identity/photo → media-worker` mesh, and there is no
guard against secrets leaking into logs. This is the biggest observability gap
today and it pays off on the existing TypeScript slice immediately.

## Goal

Give every service a structured-JSON logging baseline with a correlation id
propagated across HTTP, gRPC, and RabbitMQ, consistent levels, and no secrets
in logs — without building a metrics/tracing backend (that is `pb6`).

## Decisions

These were settled in the brainstorming pass (the brief left them open):

1. **Correlation id = OpenTelemetry trace context.** Adopt `@opentelemetry/api`
   + auto-instrumentation for **context propagation only** — no exporter, no
   backend. W3C `traceparent` flows across HTTP/gRPC/AMQP; `trace_id`/`span_id`
   are stamped into every log line. This delivers zg6's goal and lays `pb6`'s
   foundation with zero throwaway (the lighter homemade-correlation-id option
   would largely be rebuilt by `pb6`).
2. **TS logger = `nestjs-pino` + `pino`.** Structured JSON out of the box,
   per-request child logger, built-in path-based redaction, and a simple mixin
   to inject `trace_id`/`span_id`. Chosen over a hand-rolled `LoggerService`
   (more code, less battle-tested redaction/perf).
3. **`media-worker` = light include.** Structured JSON logs in Python now, and
   the trace context carried through the **existing** proto `correlation_id`
   field — no Python OTel SDK yet (that is `pb6`). This achieves end-to-end log
   correlation through the media path without re-instrumentation later.

## Scope

In scope:

- Structured JSON logging in `api-gateway`, `identity-service`, `photo-service`,
  and `media-worker`.
- OTel trace-context propagation (W3C `traceparent`) for **propagation only**:
  `web → api-gateway` (generate, or accept an inbound `traceparent`) → gRPC →
  identity/photo → RabbitMQ (job + result) → media-worker.
- `trace_id`/`span_id` on every log line; `trace_id` is the cross-service
  correlation key.
- Secret redaction: cookies, authorization headers, passwords/hashes, presigned
  URLs.

Out of scope (boundaries confirmed against the brief):

- OTLP exporter, trace/metrics backend, RED metrics → `pb6` (purely additive on
  top of this; the spans created here are reused).
- Log shipping / aggregation backend → `cmb`.
- Service readiness `/ready` → `de6` (separate; a correlation id only makes
  those checks easier to trace later).
- Dev pretty-printing of logs — one canonical JSON format everywhere.

## Components

### 1. Shared TS observability layer (single source of truth)

OTel bootstrap and the pino config — including the **security-sensitive
redaction path list**, which must not be duplicated across services — live in
one reusable place, proposed as a small buildable workspace package
`@photoops/observability` (its own build → `dist`; `pino`/`@opentelemetry/*` are
its own runtime deps):

- `startTracing(serviceName)` — initialize the OTel `NodeSDK` in
  **propagation-only** mode: `W3CTraceContextPropagator` + auto-instrumentation
  (`http`, `express`, `grpc`, `amqplib`), **no exporter**. Imported as the very
  first line of each service `main.ts` (before Nest) so instrumentation patches
  modules before they load.
- `loggerOptions` — shared pino config: level from `LOG_LEVEL`, base field
  `{ service }`, a mixin injecting `trace_id`/`span_id` from the active OTel
  context, and the `redact` paths.

Note: `packages/proto-ts` is source-only and **not** runtime-consumable (the
services do not import it at runtime), so there is no precedent runtime package.
The exact packaging (buildable package vs path-mapped sources) is settled in the
plan; the principle is one shared module, not copy-paste across three services.

### 2. Per-service TS wiring

- `api-gateway`: `nestjs-pino` `LoggerModule.forRoot(loggerOptions)`; auto-logs
  HTTP requests (method/url/status/responseTime) on completion. The existing
  `HttpErrorFilter` switches to the injected pino logger so error mapping is
  logged by the level map (4xx → `warn`, 5xx → `error`) with `trace_id`.
- `identity-service`, `photo-service`: same `LoggerModule`; plus a lightweight
  gRPC `LoggingInterceptor` (one line per RPC: method, outcome, duration) — pino
  HTTP auto-logging does not cover gRPC.

### 3. media-worker (Python)

- Replace `logging.basicConfig(format="%(message)s")` with structured JSON via
  `python-json-logger` (minimal change: a stdlib-logging formatter; no
  structlog).
- A `contextvars`-based logging filter injects `correlation_id`/`trace_id` into
  every record for the duration of a job, sourced from the incoming
  `ProcessPhotoJob.correlation_id`. No full Python OTel SDK now (that is `pb6`).

## Trace-context propagation flow

### Synchronous path (HTTP + gRPC) — auto-instrumentation only, no hand-written code

```
web → [HTTP] → api-gateway → [gRPC] → identity-service
                          └→ [gRPC] → photo-service
```

- At the gateway edge, OTel `http` instrumentation either accepts an inbound
  `traceparent` (if `web` sends one — future) or starts a new root trace, so
  every request has a `trace_id`.
- `grpc` instrumentation automatically injects `traceparent` into gRPC metadata
  on the client side (the gateway's hand-rolled `@grpc/grpc-js` clients are
  patched at the library level, regardless of being constructed by hand) and
  extracts it on the identity/photo side. Their logs carry the same `trace_id`.
  Metadata is never touched by hand.

### Asynchronous path (RabbitMQ) — bridged by photo-service

The Python worker has no OTel SDK, so it does not read OTel message headers.
Context is carried through the **existing proto `correlation_id` field** (whose
documented purpose is "threaded through logs/trace; not an idempotency key"):

```
photo-service ──[ProcessPhotoJob, correlation_id = W3C traceparent]──→ media-worker
photo-service ←─[PhotoProcessingResult, correlation_id = same traceparent]── media-worker
```

- **On job publish:** replace `const correlationId = uuidv7()` with
  `correlationId = <active span's traceparent> ?? uuidv7()` (fallback to a uuid
  when publishing outside a request scope, e.g. a background reprocess). Publish
  happens inside a gRPC-handled request, so the active context is the
  originating user request's trace. `processing_jobs.correlation_id` (text,
  nullable — no migration needed) now stores the traceparent, which is more
  useful (links the async job to the originating trace). `job_id`
  (== `ProcessingJob.id`) remains the job identity and idempotency key — no
  semantics lost.
- **Worker:** parses `trace_id` from the `traceparent`, puts it in `contextvars`
  so all its lines carry it, and echoes `correlation_id` back in the result
  (already done).
- **On result consume:** photo-service parses the `traceparent` from
  `correlation_id` and binds the OTel context (`extract`) for the duration of
  result handling, so the result-consumer's lines carry the same `trace_id`.

**Zero throwaway for `pb6`:** carry the **full** traceparent
(`00-<trace_id>-<span_id>-01`), not a bare trace_id. In `pb6`, Python OTel can
extract it and continue the trace as a child span with no re-instrumentation.

## Log shape and levels

Each line is one JSON object on stdout:

| Field | Source | Example |
| --- | --- | --- |
| `level` | pino | `"info"` |
| `time` | pino (epoch ms) | `1750000000000` |
| `service` | base field | `"photo-service"` |
| `trace_id` | OTel mixin (empty if no active span) | `"4bf92f35..."` |
| `span_id` | OTel mixin | `"00f067aa..."` |
| `msg` | call site | `"request completed"` |
| (HTTP) `req.method`, `req.url`, `res.statusCode`, `responseTime` | nestjs-pino auto | — |

- `trace_id` is the **primary cross-service correlation key**. pino's local
  `req.id` is left as-is and not relied upon across services.
- The Python worker emits the same shape: `service: "media-worker"`,
  `trace_id`, `correlation_id`, `msg` + job fields (`job_id`, `photo_id`).

Level map (consistent across all services):

| Level | When | Examples |
| --- | --- | --- |
| `debug` | opt-in via `LOG_LEVEL=debug` | step details |
| `info` | lifecycle + successful operations | startup/`listening`, request completed, job published/handled |
| `warn` | expected/handled failures | validation error, auth rejection, missing MinIO object |
| `error` | unexpected/unhandled | unhandled exception, handler crash |

Default `LOG_LEVEL=info`, overridable per service via env.

## Secret redaction ("no secrets in logs")

Single redaction path list in `loggerOptions.redact` (one source of truth in
`@photoops/observability`), censor = `"[REDACTED]"` (not removal — the field's
presence stays visible). The Python worker mirrors the same set in its JSON
formatter.

| Category | Paths (pino) | Why |
| --- | --- | --- |
| Cookies | `req.headers.cookie`, `res.headers["set-cookie"]` | `photoops_session` cookie is the session bearer |
| Auth headers | `req.headers.authorization` | future/proxy |
| Passwords & hashes | `*.password`, `*.passwordHash`, `password`, `passwordHash` | identity signup/login; argon2 hashes not logged |
| Presigned URLs | `*.uploadUrl`, `uploadUrl`, `*.presignedUrl` | signed PUT URL = temporary MinIO write access; log `object_key` instead |

Additional guards:

- nestjs-pino auto-logs the request object; serializers are configured so the
  body (`req.body` with a password) and headers pass through redaction — no raw
  request dumps.
- Presentation rule: code logs **domain identifiers** (`user_id`, `photo_id`,
  `object_key`, `trace_id`), not secret values. Redaction is a safety net, not
  the primary mechanism. The same identifiers-only rule applies in the worker.

## Testing strategy

TDD — tests first.

- **Unit (TS, shared package):**
  - *Redaction* — a log object with `cookie`/`authorization`/`password`/
    `passwordHash`/`uploadUrl` through a capturing stream → assert `[REDACTED]`;
    guards against list drift.
  - *OTel mixin* — with an active span, a line carries `trace_id`/`span_id`;
    with none, the fields are empty and nothing throws.
  - *traceparent parsing* — the bridge helper (traceparent ↔ trace_id)
    round-trips and tolerates a garbage/empty `correlation_id`.
- **Component (TS):** the gRPC `LoggingInterceptor` writes one line per RPC with
  duration and outcome; `HttpErrorFilter` maps 4xx → `warn`, 5xx → `error` with
  `trace_id`.
- **Python (pytest):** the JSON formatter produces the expected shape; the
  `contextvars` filter injects `correlation_id`/`trace_id` from a job into all
  handling lines.
- **End-to-end correlation:** extend the existing `smoke-stack` — after the
  upload pass, grep every service's logs and assert a single `trace_id` appears
  across gateway → identity/photo → media-worker → result (and that no
  cookie/password/presigned URL appears). If that proves heavy in smoke, capture
  it as a manual e2e scenario instead.

Manual e2e scenario (AGENTS requirement — written and approved before
implementation): sign in, upload a JPEG, wait for processing; from the logs
assemble a single `trace_id` across the whole chain; confirm no secrets in logs.

## Config and documentation

- New env var `LOG_LEVEL` (default `info`) across all services, added to
  `.env.example`. Service name is set in code via `startTracing(name)`. No new
  required variables.
- Update nested `CLAUDE.md` (`api-gateway`, `identity-service`, `photo-service`,
  `media-worker`) with logging/correlation sections.
- Short note in `docs/architecture.md` (Current Build State) on the
  observability seam.
- Update `README.md` (Verification) to mention `LOG_LEVEL` and the trace_id
  check.
- `bd remember` — durable fact: the `correlation_id = traceparent` bridge and
  the OTel "propagation-only" mode.

## Risks and trade-offs

- **OTel auto-instrumentation on hand-rolled grpc-js clients** — patching is at
  the `@grpc/grpc-js` library level, so the gateway's manual clients are covered;
  verified during implementation.
- **`correlation_id` semantics change** (uuidv7 → traceparent) is within
  photo-service's own DB and matches the proto field's documented purpose; not
  architecture-sensitive. Existing rows keep their uuidv7 values (free-form text
  column, no constraint).
- **Worker without OTel SDK** means the async hop relies on the proto field, not
  OTel headers; this is the deliberate light-include trade-off, resolved in
  `pb6`.
```
