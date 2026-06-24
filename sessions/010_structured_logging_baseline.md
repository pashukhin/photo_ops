# Session 010: Structured Logging Baseline (Planned)

Status: **Planned — not started.** Forward-looking stub; the full brief,
accepted spec, and plan are written when the session begins (start with a
brainstorming pass — the design choices below are open). Tracks `photo_ops-zg6`.

## Goal

Give the existing services a structured-logging baseline so support and
diagnosis stop relying on `make logs` over raw stdout. This is the biggest
observability gap today and it pays off on the current TypeScript slice
immediately, independent of future service shape.

> Problem: no centralized or structured logs. What: structured JSON logging
> with a request/correlation id propagated web → api-gateway → identity/photo
> (including across gRPC), consistent levels, and no secrets in logs.

## Scope (sketch — to be settled in brainstorming)

- **Structured JSON logs** with consistent levels across `api-gateway`,
  `identity-service`, and `photo-service` (pick a logger: Nest's built-in vs
  pino/nestjs-pino — decide in the design pass).
- **Correlation id = OpenTelemetry trace context** (see the design steer
  below), generated (or accepted from an inbound `traceparent`) at the
  `web` → `api-gateway` edge and **propagated across gRPC and the RabbitMQ
  job/result** to identity/photo/media-worker, so a single request is
  traceable across the whole mesh. Logs carry `trace_id`/`span_id`.
- **No secrets in logs** — redact tokens, passwords, cookies, presigned URLs.
- Wire the Python `media-worker` into the same shape where it makes sense
  (job/correlation id carried on the `ProcessPhotoJob` message), or explicitly
  defer it.

## Why now

- Foundation of observability that helps existing services today.
- **Blocks `photo_ops-pb6`** (metrics + tracing / OpenTelemetry) — structured
  logs + a correlation id are the substrate tracing builds on.

## Design steer: correlation id = OpenTelemetry trace context

A recommendation for the brainstorming pass, not a settled decision — but a
strong default. zg6 (correlation id) and `pb6` (distributed tracing) overlap on
one thing: **OpenTelemetry's trace context (W3C `traceparent`) _is_ a
correlation id** propagated across HTTP → gRPC → AMQP. So rather than build a
bespoke correlation-id header that `pb6` would later rebuild and discard:

- **In zg6 (now):** adopt `@opentelemetry/api` + auto-instrumentation
  (HTTP/gRPC/pg/amqp) for **context propagation only**, and stamp
  `trace_id`/`span_id` into the structured logs. No exporter, no backend — OTel
  just propagates context and correlates logs. This delivers zg6's actual goal
  while laying `pb6`'s foundation with zero throwaway.
- **In `pb6` (later):** purely additive — an OTLP exporter + a trace/metrics
  backend (Jaeger/Tempo + Prometheus, or a collector) in compose, plus RED
  metrics. The spans already exist, so there is no re-instrumentation.

The lighter alternative (a homemade correlation id now, all OTel deferred to
`pb6`) is simpler today but largely throwaway. Given this is a real
HTTP+gRPC+AMQP mesh — where the session-009 readiness-race 500 would have been
obvious from a single trace — the OTel-context default is preferred. Settle it
in the design pass.

## Adjacent (not this session)

- `photo_ops-de6` (service readiness checks). Session 009 found that the
  gateway's `/health` is **static** — it answers before its gRPC channels to
  identity/photo are connected, so it is not a real readiness signal (the
  `smoke-stack` harness had to gate on a functional mesh round-trip instead). A
  real `/ready` is `de6`; a correlation id from this session makes those checks
  easier to trace. Consider sequencing de6 alongside.
- `photo_ops-pb6` (metrics/tracing) — the unblocked follow-on.

## Out of scope

- OTel **exporters, a trace/metrics backend, and RED metrics** (`pb6`). Note
  the seam: OTel *context propagation + log correlation* is in scope here; only
  the exporter/backend/metrics half is deferred.
- Log shipping / aggregation backend (future production infrastructure,
  `photo_ops-cmb`).

## References

- Tracker: `photo_ops-zg6` (blocks `photo_ops-pb6`).
- Readiness finding: `sessions/009_polyglot_gate_and_ergonomics.md`,
  `photo_ops-de6`.
- `docs/architecture.md`, `docs/domain-model.md`.
