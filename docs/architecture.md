# Architecture

The accepted architecture frame is documented in `docs/superpowers/specs/2026-06-21-photoops-architecture-frame-design.md`.

This file records the durable architecture and contract boundaries the system must preserve. Agents working on the project must keep changes consistent with these boundaries; see `AGENTS.md` for how boundary-touching changes are handled.

## Service And Data Boundaries

- `web` talks only to `api-gateway`, except for presigned MinIO upload URLs.
- `api-gateway` must not connect to any database.
- `photo-service` owns `photo-db` and the photo upload/list domain.
- `identity-service` owns `identity-db`, users, credentials, and sessions.
- `usage-service` owns `usage-db` and the usage-accounting plane (first Go service). It exposes `GetUsageSummary` over gRPC (consumed by `api-gateway`) and consumes `usage.events` from RabbitMQ (emitted by `photo-service`).
- `cluster-service` owns `cluster-db` and the clustering plane (first Python gRPC service; monolingual Python API + compute). It exposes `GenerateClusters` / `GetClusteringResult` / `ListClusteringResults` / `ListClusteringMethods` over gRPC (consumed by `api-gateway`), reads photo attributes via the internal `photo-service` `ListPhotoSpacetime` RPC, runs clustering async over RabbitMQ, and emits `usage.events` to the usage plane. See ADR-0005.
- Data-owning services use separate databases. A service must connect only to its own DB.
- Cross-service references use UUID v7.

## Contract And Runtime Boundaries

- Sync service contracts are proto-first.
- Use RabbitMQ for async workflows later; do not invent async contracts before they are needed.
- `usage.events` async consumption contract: producers (e.g. `photo-service`, `cluster-service`) **emit** `ConsumptionEvent` protobuf messages onto the `usage.events` RabbitMQ exchange (emit-not-pull). `usage-service` is the sole consumer. The topology (durable direct exchange + DLX/DLQ) is declared by the consumer at startup.
- `cluster.process` / `cluster.result` async contract: `cluster-service` (API role) publishes a `ClusterProcessJob` on `cluster.process`; `cluster-worker` consumes it, persists the immutable tree, and publishes a `ClusterProcessResult` on `cluster.result`; the API role consumes that to flip the run's status (`result_id == job_id`, `pending → ready|failed`). Mirrors `photo.process` / `photo.result`.
- Keep MinIO object keys server-generated and independent from raw filenames.
- Originals are private; public delivery uses prepared variants in later stages.

## Current Build State

This section reflects the present state of the frame and changes as sessions land.

- Implemented services: `api-gateway`, `identity-service`, `photo-service`, `web`, `usage-service` (session-012 branch), `cluster-service` + `cluster-worker` (session-013 branch).
- `usage-service` is the first Go service: append-only ledger (`billing_events`), charge-once deduplication (`processed_events`), gRPC `GetUsageSummary` exposed through `api-gateway` at `GET /v1/usage/summary` (session-authed), and a RabbitMQ consumer for `usage.events`.
- `cluster-service` is the first Python gRPC service: deterministic hierarchical space-time clustering into immutable snapshot trees, run async across a `cluster-service` (API + `cluster.result` consumer) and a `cluster-worker` (compute) role from one image. Session 013 ships one pluggable method (`time_only`, device-segmented); space-time is a registered-later seam. See ADR-0005.
- Other services (`publication-service`, `connector-service`) remain health-only scaffolds until their approved sessions wire real behavior.
- CI (`.github/workflows/ci.yml`) gates `push`/`pull_request` on proto-drift, typecheck, lint, build, and tests across the TS slice; separate `usage-service` (Go) and `cluster-service` (Python) CI jobs run their language checks.
- Observability: structured JSON logs across all services with an OpenTelemetry trace-context correlation id propagated over HTTP/gRPC/AMQP (propagation only; no exporter/backend — that is `pb6`). Secrets are redacted centrally in `@photoops/observability`.
