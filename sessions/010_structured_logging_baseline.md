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
- **Correlation id** generated (or accepted from an inbound header) at the
  `web` → `api-gateway` edge and **propagated through gRPC** to identity/photo
  via request metadata, so a single request is traceable across services.
- **No secrets in logs** — redact tokens, passwords, cookies, presigned URLs.
- Wire the Python `media-worker` into the same shape where it makes sense
  (job/correlation id carried on the `ProcessPhotoJob` message), or explicitly
  defer it.

## Why now

- Foundation of observability that helps existing services today.
- **Blocks `photo_ops-pb6`** (metrics + tracing / OpenTelemetry) — structured
  logs + a correlation id are the substrate tracing builds on.

## Adjacent (not this session)

- `photo_ops-de6` (service readiness checks). Session 009 found that the
  gateway's `/health` is **static** — it answers before its gRPC channels to
  identity/photo are connected, so it is not a real readiness signal (the
  `smoke-stack` harness had to gate on a functional mesh round-trip instead). A
  real `/ready` is `de6`; a correlation id from this session makes those checks
  easier to trace. Consider sequencing de6 alongside.
- `photo_ops-pb6` (metrics/tracing) — the unblocked follow-on.

## Out of scope

- Metrics, tracing, OpenTelemetry (`pb6`).
- Log shipping / aggregation backend (future production infrastructure,
  `photo_ops-cmb`).

## References

- Tracker: `photo_ops-zg6` (blocks `photo_ops-pb6`).
- Readiness finding: `sessions/009_polyglot_gate_and_ergonomics.md`,
  `photo_ops-de6`.
- `docs/architecture.md`, `docs/domain-model.md`.
