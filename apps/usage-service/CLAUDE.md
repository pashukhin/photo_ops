# usage-service (Go)

The cross-cutting usage-accounting plane: it ingests `ConsumptionEvent`s from
RabbitMQ (`usage.events`) into an append-only ledger and serves
`UsageService.GetUsageSummary` over gRPC to `api-gateway`. First Go service in
the polyglot repo (session 012). Owns `usage-db`.

## Local context

- Go module `github.com/photoops/usage-service`. Layout: `cmd/usage-service`
  (entry point) + `internal/` packages.
- `internal/usage` — provider-independent core (no I/O, no external deps):
  `ConsumptionEvent`/`Measurement` domain types, `Explode` (raw-unit mapping),
  `Ledger.Record` (charge-once over a `Store` port), `StaticResolver` (pricing,
  extractable), `BuildSummary` (aggregate + estimate), `Reader` (read path).
- `internal/store` — pgxpool adapter implementing `usage.Store`.
- `internal/amqp` — RabbitMQ consumer driving the ledger from `usage.events`.
  Split by testability: `consumer.go` holds the unit-covered logic (`Decode`,
  `classifyDelivery`, `handleDelivery` — decode/record/ack-or-requeue; transient
  errors requeue, poison dead-letters); `broker.go` holds the live-I/O wiring
  (`Consumer.Start` connect+consume loop, `declareTopology`). `broker.go` is
  unit-uncoverable (needs a live broker) and is **filtered out of the coverage
  profile** in the `coverage-go` Makefile target (Go analogue of cluster-service's
  `# pragma: no cover`); it is verified by `make smoke-usage`. Keep only broker
  I/O in `broker.go` so the coverage exclusion never hides real logic.
- `internal/grpcserver` — gRPC adapter for `GetUsageSummary`.
- Schema: `migrations/` applied via `make migrate-usage`.
- Gate: `make gate-usage` (`go vet` + `golangci-lint` + `go test`), composed into
  `make gate`. Tested core is stdlib-only so unit tests need no network.

## Local invariants

- Owns and connects only to `usage-db`. Cross-service references use UUID v7
  with no cross-service FK.
- `billing_events` is append-only — never updated or deleted.
- Charge-once on intake via the `processed_events` inbox (`INSERT … ON CONFLICT
  DO NOTHING` in the same tx as the ledger rows); replay is a no-op.
- The ledger stores RAW provider-independent units + provenance (`provider`,
  `occurred_at`) only. Money is resolved at READ via the pricing layer; there
  are no `unit_price`/`amount`/`currency` columns. See ADR-0004.
- Pricing (`internal/usage` `Resolver`) is the only place money enters and is
  designed to be lifted into a separate pricing-service later without changing
  callers or the ledger.
