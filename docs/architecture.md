# Architecture

The accepted architecture frame is documented in `docs/superpowers/specs/2026-06-21-photoops-architecture-frame-design.md`.

This file records the durable architecture and contract boundaries the system must preserve. Agents working on the project must keep changes consistent with these boundaries; see `AGENTS.md` for how boundary-touching changes are handled.

## Service And Data Boundaries

- `web` talks only to `api-gateway`, except for presigned MinIO upload URLs.
- `api-gateway` must not connect to any database.
- `photo-service` owns `photo-db` and the photo upload/list domain.
- `identity-service` owns `identity-db`, users, credentials, and sessions.
- `usage-service` owns `usage-db` and the usage-accounting plane (first Go service). It exposes `GetUsageSummary` over gRPC (consumed by `api-gateway`) and consumes `usage.events` from RabbitMQ (emitted by `photo-service`).
- Data-owning services use separate databases. A service must connect only to its own DB.
- Cross-service references use UUID v7.

## Contract And Runtime Boundaries

- Sync service contracts are proto-first.
- Use RabbitMQ for async workflows later; do not invent async contracts before they are needed.
- `usage.events` async consumption contract: producers (e.g. `photo-service`) **emit** `ConsumptionEvent` protobuf messages onto the `usage.events` RabbitMQ exchange (emit-not-pull). `usage-service` is the sole consumer. The topology (durable direct exchange + DLX/DLQ) is declared by the consumer at startup.
- Keep MinIO object keys server-generated and independent from raw filenames.
- Originals are private; public delivery uses prepared variants in later stages.

## Current Build State

This section reflects the present state of the frame and changes as sessions land.

- Implemented services: `api-gateway`, `identity-service`, `photo-service`, `web`, `usage-service` (session-012 branch).
- `usage-service` is the first Go service: append-only ledger (`billing_events`), charge-once deduplication (`processed_events`), gRPC `GetUsageSummary` exposed through `api-gateway` at `GET /v1/usage/summary` (session-authed), and a RabbitMQ consumer for `usage.events`.
- Other services (`cluster-service`, `publication-service`, `connector-service`) remain health-only scaffolds until their approved sessions wire real behavior.
- CI (`.github/workflows/ci.yml`) gates `push`/`pull_request` on proto-drift, typecheck, lint, build, and tests across the TS slice; a separate `usage-service` CI job runs `go vet`, `golangci-lint`, and `go test` for the Go service.
- Observability: structured JSON logs across all services with an OpenTelemetry trace-context correlation id propagated over HTTP/gRPC/AMQP (propagation only; no exporter/backend — that is `pb6`). Secrets are redacted centrally in `@photoops/observability`.
